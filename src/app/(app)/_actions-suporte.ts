"use server"

/**
 * Chat de suporte do CLIENTE — o balão flutuante.
 *
 * A primeira camada é um CATÁLOGO de respostas escritas (ver
 * `src/lib/suporte/ajuda.ts`), não um modelo. A troca é uma melhora, não uma
 * economia: as perguntas que mais aparecem têm resposta exata no banco, e
 * passá-las por uma IA é pagar pra transformar um dado certo numa frase que
 * pode sair errada.
 *
 * Texto livre NÃO é respondido automaticamente: vai direto pra fila da equipe.
 * Fingir que entendeu uma pergunta que ninguém previu é o jeito mais rápido de
 * queimar a confiança no chat inteiro.
 */

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { montarRaioX } from "@/lib/data/suporte-raio-x"
import { avisarEquipe } from "@/lib/suporte/avisos"
import { acharPergunta } from "@/lib/suporte/ajuda"
import { resolverDado } from "@/lib/suporte/ajuda-dados"

export type MensagemSuporte = {
  id: string
  autor: "cliente" | "ia" | "ajuda" | "equipe"
  texto: string
  criadaEm: string
}

export type ConversaSuporte = {
  id: string
  status: "ia" | "aguardando_humano" | "com_humano" | "resolvida"
  mensagens: MensagemSuporte[]
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

/**
 * Confere que a conversa é mesmo da empresa de quem está pedindo.
 *
 * Sem isto, o id na requisição viraria a porta pra ler e escrever no chat de
 * outro cliente. Toda ação passa por aqui.
 */
async function conversaDoCliente(conversaId: string) {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("suporte_conversas")
    .select("id, status, holding_id, lida_equipe_em")
    .eq("id", conversaId)
    .maybeSingle()
  const c = data as {
    status: ConversaSuporte["status"]
    holding_id: string
    lida_equipe_em: string | null
  } | null
  if (!c || c.holding_id !== holdingId) return null
  return { ...c, holdingId, admin }
}

/**
 * Cliente clicou numa pergunta da Central de Ajuda.
 *
 * Grava a pergunta e a resposta na conversa — não é enfeite: quando o caso
 * subir pra uma pessoa, ela vê o que o cliente JÁ leu e não repete a mesma
 * coisa. Repetir a resposta que a pessoa acabou de descartar é o jeito mais
 * rápido de fazer o chat parecer inútil.
 */
export async function responderDoCatalogo(
  conversaId: string,
  perguntaId: string,
): Promise<EnvioState> {
  const user = await usuario()
  const c = await conversaDoCliente(conversaId)
  if (!user || !c) return { ok: false, erro: "Conversa não encontrada." }

  const pergunta = acharPergunta(perguntaId)
  if (!pergunta) return { ok: false, erro: "Pergunta não encontrada." }

  const { admin } = c
  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "cliente",
    user_id: user.id,
    texto: pergunta.titulo,
  })

  let texto = pergunta.resposta
  if (pergunta.dado) {
    // O dado da conta é o motivo desta central existir. Só é lido quando a
    // resposta pede — resposta de texto puro não paga o custo da consulta.
    const raioX = await montarRaioX(c.holdingId)
    texto = `${texto}\n\n${resolverDado(pergunta.dado, raioX)}`
  }

  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "ajuda",
    texto,
    ajuda_id: pergunta.id,
  })
  await admin
    .from("suporte_conversas")
    .update({
      ultima_msg_em: new Date().toISOString(),
      lida_cliente_em: new Date().toISOString(),
    })
    .eq("id", conversaId)

  return { ok: true, conversa: (await abrirConversa()) ?? undefined }
}

/**
 * Texto livre do cliente. Vai DIRETO pra fila da equipe.
 *
 * Não existe tentativa automática de responder: se a dúvida não estava na
 * lista, ninguém aqui sabe a resposta sem olhar. Chutar seria pior que a
 * espera.
 */
export async function enviarMensagem(
  conversaId: string,
  texto: string,
): Promise<EnvioState> {
  const user = await usuario()
  const msg = texto.trim()
  if (!msg) return { ok: false, erro: "Escreva sua mensagem." }
  if (msg.length > 2000) return { ok: false, erro: "Mensagem muito longa." }

  const c = await conversaDoCliente(conversaId)
  if (!user || !c) return { ok: false, erro: "Conversa não encontrada." }
  const { admin } = c

  await admin.from("suporte_mensagens").insert({
    conversa_id: conversaId,
    autor: "cliente",
    user_id: user.id,
    texto: msg,
  })

  const jaEraDeGente = c.status !== "ia"
  await admin
    .from("suporte_conversas")
    .update({
      status: jaEraDeGente ? c.status : "aguardando_humano",
      ultima_msg_em: new Date().toISOString(),
      lida_equipe_em: null,
      // O cliente acabou de escrever: ele está com o chat aberto. Marcar como
      // lido aqui é o que impede a própria mensagem dele de acender o selo de
      // "tem resposta nova" — e o que segura o push de uma resposta que ele vai
      // ler na tela, sem sair do lugar.
      lida_cliente_em: new Date().toISOString(),
    })
    .eq("id", conversaId)

  // Só avisa "entrou na fila" na PRIMEIRA vez. Repetir isso a cada mensagem
  // faria a conversa virar uma parede de avisos automáticos entre as frases
  // que interessam.
  if (!jaEraDeGente) {
    await admin.from("suporte_mensagens").insert({
      conversa_id: conversaId,
      autor: "ajuda",
      texto:
        "Recebi sua mensagem e chamei alguém da equipe. A resposta chega aqui mesmo — pode fechar o chat que a gente te avisa.",
    })
  }

  await avisarEquipe({
    conversaId,
    holdingId: c.holdingId,
    texto: msg,
    escalouAgora: !jaEraDeGente,
    lidaEquipeEm: c.lida_equipe_em,
  })

  revalidatePath("/suporte")
  return { ok: true, conversa: (await abrirConversa()) ?? undefined }
}

/** O cliente pede gente sem escrever nada — o "não resolveu" do fim da resposta. */
export async function pedirAtendente(conversaId: string): Promise<EnvioState> {
  const c = await conversaDoCliente(conversaId)
  if (!c) return { ok: false, erro: "Conversa não encontrada." }
  const { admin } = c

  if (c.status === "ia") {
    await admin
      .from("suporte_conversas")
      .update({
        status: "aguardando_humano",
        ultima_msg_em: new Date().toISOString(),
        lida_equipe_em: null,
      })
      .eq("id", conversaId)
    await admin.from("suporte_mensagens").insert({
      conversa_id: conversaId,
      autor: "ajuda",
      texto:
        "Certo, vou chamar alguém da equipe. Você recebe a resposta aqui mesmo — pode fechar o chat que a gente te avisa.",
    })
    await avisarEquipe({
      conversaId,
      holdingId: c.holdingId,
      texto: "Pediu pra falar com uma pessoa.",
      escalouAgora: true,
      lidaEquipeEm: c.lida_equipe_em,
    })
  }

  revalidatePath("/suporte")
  return { ok: true, conversa: (await abrirConversa()) ?? undefined }
}
