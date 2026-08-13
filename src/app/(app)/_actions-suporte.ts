"use server"

/**
 * Chat de suporte do CLIENTE — o balão flutuante.
 *
 * A IA responde lendo o estado real da conta (`montarRaioX`), e quando não
 * puder afirmar com o dado em mãos, ela mesma sobe pra um humano. É a diferença
 * entre este chat e o WhatsApp: aqui a resposta já existe no banco no instante
 * da pergunta.
 */

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { askClaude, isAnthropicConfigured } from "@/lib/anthropic/client"
import { montarRaioX, type RaioX } from "@/lib/data/suporte-raio-x"
import { avisarEquipe } from "@/lib/suporte/avisos"

export type MensagemSuporte = {
  id: string
  autor: "cliente" | "ia" | "equipe"
  texto: string
  criadaEm: string
}

export type ConversaSuporte = {
  id: string
  status: "ia" | "aguardando_humano" | "com_humano" | "resolvida"
  mensagens: MensagemSuporte[]
}

/** Marca que o chat precisa de gente. Some da IA e entra na fila do painel. */
const PEDIU_HUMANO = "[[ESCALAR]]"

/**
 * Quantas perguntas a IA responde antes de chamar gente.
 *
 * Três é o ponto onde a conversa deixa de ser dúvida e vira problema. Quem
 * perguntou três vezes ou não foi entendido, ou tem um caso que o retrato da
 * conta não cobre — e a quarta resposta automática, nessa altura, lê como
 * enrolação. Melhor entregar pra um humano com o histórico pronto do que
 * insistir.
 *
 * De quebra segura o custo: o teto por conversa é conhecido.
 */
const MAX_PERGUNTAS_IA = 3

function instrucoes(raioX: RaioX | null): string {
  return `Você é o suporte do Delivery OS, um sistema que junta o faturamento de
delivery (iFood, 99 Food, Keeta e Cardápio Web) de redes de restaurante.

COMO RESPONDER
- Português do Brasil, direto, sem saudação longa e sem "sinto muito pelo
  transtorno". Vá ao ponto.
- No máximo 4 linhas, salvo se a pessoa pedir detalhe.
- Use SEMPRE o retrato da conta abaixo. Cite loja pelo nome e número, e data
  quando existir.

⚠️ REGRA QUE NÃO SE QUEBRA: só afirme o que estiver no retrato. Se a pergunta
depende de algo que não está ali — valor de fatura, erro específico, pedido de
mudança, reclamação, qualquer coisa sobre dinheiro — NÃO invente e NÃO chute.
Responda em uma linha que vai chamar alguém e termine a mensagem com ${PEDIU_HUMANO}
(exatamente assim, na última linha). Suporte que chuta é pior que suporte lento.

VOCÊ TEM NO MÁXIMO ${MAX_PERGUNTAS_IA} RESPOSTAS nesta conversa. Se sentir que
não está resolvendo, não insista: chame alguém antes de gastar as três.

O QUE VOCÊ SABE FAZER SOZINHO
- Dizer se uma loja está conectada, aguardando ou revogada, e desde quando.
- Dizer até que dia entrou dado de cada loja.
- Explicar que loja aguardando o iFood conecta sozinha em até 15 min depois que
  o iFood libera, e que não há nada a fazer do lado do cliente.
- Explicar que o relatório de ITENS VENDIDOS ainda é planilha no iFood e na
  Keeta (a API deles não entrega esse dado).

RETRATO DA CONTA AGORA:
${raioX ? JSON.stringify(raioX, null, 1) : "(não consegui ler o estado da conta — escale)"}`
}

async function usuario() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

/** Conversa aberta do cliente, ou uma nova. Uma por vez, de propósito. */
export async function abrirConversa(): Promise<ConversaSuporte | null> {
  const user = await usuario()
  const holdingId = await getCurrentHoldingId()
  if (!user || !holdingId) return null
  const admin = createAdminClient()

  const { data: existente } = await admin
    .from("suporte_conversas")
    .select("id, status")
    .eq("holding_id", holdingId)
    .neq("status", "resolvida")
    .order("ultima_msg_em", { ascending: false })
    .limit(1)
    .maybeSingle()

  let id = (existente as { id: string } | null)?.id
  let status =
    (existente as { status: ConversaSuporte["status"] } | null)?.status ?? "ia"

  if (!id) {
    const { data: nova, error } = await admin
      .from("suporte_conversas")
      .insert({ holding_id: holdingId, aberta_por: user.id })
      .select("id, status")
      .single()
    if (error || !nova) return null
    id = (nova as { id: string }).id
    status = "ia"
  }

  const { data: msgs } = await admin
    .from("suporte_mensagens")
    .select("id, autor, texto, criada_em")
    .eq("conversa_id", id)
    .order("criada_em")

  // Abriu o balão = leu. É o que apaga o selo de resposta nova e o que faz o
  // aviso de push segurar enquanto a pessoa está com a conversa na frente.
  await admin
    .from("suporte_conversas")
    .update({ lida_cliente_em: new Date().toISOString() })
    .eq("id", id)

  return {
    id,
    status,
    mensagens: ((msgs ?? []) as {
      id: string
      autor: MensagemSuporte["autor"]
      texto: string
      criada_em: string
    }[]).map((m) => ({
      id: m.id,
      autor: m.autor,
      texto: m.texto,
      criadaEm: m.criada_em,
    })),
  }
}

/**
 * Tem resposta da equipe que o cliente ainda não viu?
 *
 * Sem isto o único sinal de resposta é o push — e quem negou a permissão de
 * notificação, ou dispensou o aviso, não teria nenhum. É uma consulta de duas
 * colunas, chamada ao montar e ao voltar pra aba: barato o bastante pra não
 * virar polling.
 */
export async function temRespostaNova(): Promise<boolean> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return false
  const { data } = await createAdminClient()
    .from("suporte_conversas")
    .select("ultima_msg_em, lida_cliente_em")
    .eq("holding_id", holdingId)
    .neq("status", "resolvida")
    .order("ultima_msg_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  const c = data as {
    ultima_msg_em: string
    lida_cliente_em: string | null
  } | null
  if (!c) return false
  return (
    !c.lida_cliente_em ||
    Date.parse(c.lida_cliente_em) < Date.parse(c.ultima_msg_em)
  )
}

export type EnvioState = { ok: boolean; conversa?: ConversaSuporte; erro?: string }

export async function enviarMensagem(
  conversaId: string,
  texto: string,
): Promise<EnvioState> {
  const user = await usuario()
  const holdingId = await getCurrentHoldingId()
  const msg = texto.trim()
  if (!user || !holdingId) return { ok: false, erro: "Sessão expirada." }
  if (!msg) return { ok: false, erro: "Escreva sua mensagem." }
  if (msg.length > 2000) return { ok: false, erro: "Mensagem muito longa." }

  const admin = createAdminClient()

  // A conversa TEM que ser da empresa de quem está mandando. Sem isto, o id na
  // requisição viraria a porta pra escrever no chat de outro cliente.
  const { data: conv } = await admin
    .from("suporte_conversas")
    .select("id, status, holding_id, lida_equipe_em")
    .eq("id", conversaId)
    .maybeSingle()
  const c = conv as {
    status: ConversaSuporte["status"]
    holding_id: string
    lida_equipe_em: string | null
  } | null
  if (!c || c.holding_id !== holdingId) return { ok: false, erro: "Conversa não encontrada." }

  /** Chama a equipe. `escalou` = acabou de virar caso de gente. */
  const chamarEquipe = (escalou: boolean) =>
    avisarEquipe({
      conversaId,
      holdingId,
      texto: msg,
      escalouAgora: escalou,
      lidaEquipeEm: c.lida_equipe_em,
    })

  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "cliente",
    user_id: user.id,
    texto: msg,
  })
  await admin
    .from("suporte_conversas")
    .update({
      ultima_msg_em: new Date().toISOString(),
      lida_equipe_em: null,
      // O cliente acabou de escrever: ele está com o chat aberto. Marcar como
      // lido aqui é o que impede a própria mensagem dele de acender o selo de
      // "tem resposta nova" — e o que segura o push de uma resposta que ele vai
      // ler na tela, sem sair do lugar.
      lida_cliente_em: new Date().toISOString(),
    })
    .eq("id", conversaId)

  // Quantas vezes o cliente já perguntou (incluindo a de agora).
  const { count: perguntas } = await admin
    .from("suporte_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", conversaId)
    .eq("autor", "cliente")
  const jaPerguntou = perguntas ?? 1

  // Passou do teto: nem chama a IA. Uma quarta resposta automática pra quem já
  // perguntou três vezes lê como enrolação.
  if (c.status === "ia" && jaPerguntou > MAX_PERGUNTAS_IA) {
    await admin
      .from("suporte_conversas")
      .update({ status: "aguardando_humano" })
      .eq("id", conversaId)
    await admin.from("suporte_mensagens").insert({
      conversa_id: conversaId,
      autor: "ia",
      texto:
        "Acho melhor alguém da equipe olhar isso com calma. Já passei sua conversa — a resposta chega aqui mesmo, pode fechar o chat que a gente te avisa.",
    })
    await chamarEquipe(true)
    revalidatePath("/suporte")
    return { ok: true, conversa: (await abrirConversa()) ?? undefined }
  }

  // Conversa que já é de gente: a IA não entra e a equipe precisa saber que o
  // cliente falou de novo. Sem isto, quem respondeu fica esperando um sinal que
  // nunca vem e a conversa morre do nosso lado.
  if (c.status !== "ia") await chamarEquipe(false)

  // IA fora do ar (chave ausente) NÃO pode virar buraco negro: sem isto a
  // mensagem ficava gravada, ninguém respondia e ninguém era avisado — o
  // cliente falando sozinho com uma tela. Vai direto pra fila da equipe.
  if (c.status === "ia" && !isAnthropicConfigured()) {
    await admin
      .from("suporte_conversas")
      .update({ status: "aguardando_humano" })
      .eq("id", conversaId)
    await admin.from("suporte_mensagens").insert({
      conversa_id: conversaId,
      autor: "ia",
      texto:
        "Recebi sua mensagem e já chamei alguém da equipe. A resposta chega aqui mesmo — pode fechar o chat que a gente te avisa.",
    })
    await chamarEquipe(true)
    revalidatePath("/suporte")
    return { ok: true, conversa: (await abrirConversa()) ?? undefined }
  }

  // Com humano na conversa, a IA CALA. Duas vozes respondendo a mesma pessoa é
  // pior que nenhuma — e a equipe já viu o histórico.
  if (c.status === "ia" && isAnthropicConfigured()) {
    try {
      const raioX = await montarRaioX(holdingId)
      const { data: hist } = await admin
        .from("suporte_mensagens")
        .select("autor, texto")
        .eq("conversa_id", conversaId)
        .order("criada_em")
        .limit(20)
      const conversa = ((hist ?? []) as { autor: string; texto: string }[])
        .map((m) => `${m.autor === "cliente" ? "Cliente" : "Suporte"}: ${m.texto}`)
        .join("\n")

      const bruta = await askClaude({
        system: instrucoes(raioX),
        user: conversa,
        maxTokens: 700,
      })
      // Na ÚLTIMA pergunta do teto, responde e já chama gente junto: deixar o
      // cliente descobrir o limite só na tentativa seguinte seria fazê-lo
      // escrever mais uma vez à toa.
      const escalar = bruta.includes(PEDIU_HUMANO) || jaPerguntou >= MAX_PERGUNTAS_IA
      const limpa = bruta.replaceAll(PEDIU_HUMANO, "").trim()

      await admin.from("suporte_mensagens").insert({
        conversa_id: conversaId,
        autor: "ia",
        texto: limpa,
        raio_x: raioX,
      })
      if (escalar) {
        await admin
          .from("suporte_conversas")
          .update({ status: "aguardando_humano" })
          .eq("id", conversaId)
        await chamarEquipe(true)
      }
    } catch (e) {
      // A IA falhar NÃO pode engolir a mensagem do cliente: ela já está
      // gravada. Sobe pra humano, que é o comportamento seguro.
      console.error("suporte: IA", e)
      await admin
        .from("suporte_conversas")
        .update({ status: "aguardando_humano" })
        .eq("id", conversaId)
      await chamarEquipe(true)
    }
  }

  revalidatePath("/suporte")
  const atualizada = await abrirConversa()
  return { ok: true, conversa: atualizada ?? undefined }
}

/** O cliente pede gente, sem passar pela IA. */
export async function pedirAtendente(conversaId: string): Promise<EnvioState> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, erro: "Sessão expirada." }
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from("suporte_conversas")
    .select("holding_id, lida_equipe_em")
    .eq("id", conversaId)
    .maybeSingle()
  const c = conv as { holding_id: string; lida_equipe_em: string | null } | null
  if (c?.holding_id !== holdingId) {
    return { ok: false, erro: "Conversa não encontrada." }
  }
  await admin
    .from("suporte_conversas")
    .update({ status: "aguardando_humano", lida_equipe_em: null })
    .eq("id", conversaId)
  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "ia",
    texto:
      "Certo, vou chamar alguém da equipe. Você recebe a resposta aqui mesmo — pode fechar o chat que a gente te avisa.",
  })
  await avisarEquipe({
    conversaId,
    holdingId,
    texto: "Pediu pra falar com uma pessoa.",
    escalouAgora: true,
    lidaEquipeEm: c.lida_equipe_em,
  })
  return { ok: true, conversa: (await abrirConversa()) ?? undefined }
}
