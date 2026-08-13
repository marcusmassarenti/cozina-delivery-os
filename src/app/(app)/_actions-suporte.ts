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
    .select("id, status, holding_id")
    .eq("id", conversaId)
    .maybeSingle()
  const c = conv as { status: ConversaSuporte["status"]; holding_id: string } | null
  if (!c || c.holding_id !== holdingId) return { ok: false, erro: "Conversa não encontrada." }

  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "cliente",
    user_id: user.id,
    texto: msg,
  })
  await admin
    .from("suporte_conversas")
    .update({ ultima_msg_em: new Date().toISOString(), lida_equipe_em: null })
    .eq("id", conversaId)

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
      const escalar = bruta.includes(PEDIU_HUMANO)
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
      }
    } catch (e) {
      // A IA falhar NÃO pode engolir a mensagem do cliente: ela já está
      // gravada. Sobe pra humano, que é o comportamento seguro.
      console.error("suporte: IA", e)
      await admin
        .from("suporte_conversas")
        .update({ status: "aguardando_humano" })
        .eq("id", conversaId)
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
    .select("holding_id")
    .eq("id", conversaId)
    .maybeSingle()
  if ((conv as { holding_id: string } | null)?.holding_id !== holdingId) {
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
  return { ok: true, conversa: (await abrirConversa()) ?? undefined }
}
