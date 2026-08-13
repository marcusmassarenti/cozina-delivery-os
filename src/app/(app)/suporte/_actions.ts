"use server"

/**
 * Painel de chamados — o lado da EQUIPE.
 *
 * O que faz este painel valer é o raio-x ao lado da conversa: quem responde vê
 * o estado da conta do cliente sem sair da tela e sem perguntar de volta "qual
 * loja?". No WhatsApp, essa ida e volta é metade do atendimento.
 */

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperadmin } from "@/lib/auth/permissions"
import { montarRaioX, type RaioX } from "@/lib/data/suporte-raio-x"

export type ChamadoResumo = {
  id: string
  empresa: string
  holdingId: string
  status: "ia" | "aguardando_humano" | "com_humano" | "resolvida"
  ultimaMsgEm: string
  ultimoTexto: string | null
  ultimoAutor: "cliente" | "ia" | "equipe" | null
  /** Cliente escreveu e ninguém da equipe leu depois disso. */
  naoLida: boolean
  mensagens: number
}

export type ChamadoDetalhe = {
  id: string
  empresa: string
  status: ChamadoResumo["status"]
  mensagens: {
    id: string
    autor: "cliente" | "ia" | "equipe"
    texto: string
    criadaEm: string
  }[]
  raioX: RaioX | null
}

async function exigirEquipe() {
  if (!(await isSuperadmin())) throw new Error("Sem permissão.")
  return createAdminClient()
}

/**
 * A fila. Ordem: quem espera gente primeiro, depois o resto por recência.
 *
 * Resolvida NÃO aparece por padrão — a fila é sobre o que falta fazer. Sem
 * isso, em duas semanas a tela vira um arquivo morto onde o chamado novo se
 * perde no meio dos antigos.
 */
export async function listarChamados(
  incluirResolvidas = false,
): Promise<ChamadoResumo[]> {
  const admin = await exigirEquipe()

  let q = admin
    .from("suporte_conversas")
    .select("id, holding_id, status, ultima_msg_em, lida_equipe_em")
    .order("ultima_msg_em", { ascending: false })
    .limit(200)
  if (!incluirResolvidas) q = q.neq("status", "resolvida")
  const { data: convs } = await q

  const linhas = (convs ?? []) as {
    id: string
    holding_id: string
    status: ChamadoResumo["status"]
    ultima_msg_em: string
    lida_equipe_em: string | null
  }[]
  if (linhas.length === 0) return []

  const [{ data: hs }, { data: msgs }] = await Promise.all([
    admin
      .from("holdings")
      .select("id, name")
      .in("id", [...new Set(linhas.map((c) => c.holding_id))]),
    admin
      .from("suporte_mensagens")
      .select("conversa_id, autor, texto, criada_em")
      .in("conversa_id", linhas.map((c) => c.id))
      .order("criada_em", { ascending: false }),
  ])
  const nome = new Map(
    ((hs ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]),
  )
  // Última mensagem e total, numa passada só sobre o lote.
  const ultima = new Map<string, { autor: string; texto: string }>()
  const total = new Map<string, number>()
  for (const m of (msgs ?? []) as {
    conversa_id: string
    autor: string
    texto: string
  }[]) {
    if (!ultima.has(m.conversa_id)) ultima.set(m.conversa_id, m)
    total.set(m.conversa_id, (total.get(m.conversa_id) ?? 0) + 1)
  }

  const peso = (s: ChamadoResumo["status"]) =>
    s === "aguardando_humano" ? 0 : s === "com_humano" ? 1 : s === "ia" ? 2 : 3

  return linhas
    .map((c) => ({
      id: c.id,
      empresa: nome.get(c.holding_id) ?? "—",
      holdingId: c.holding_id,
      status: c.status,
      ultimaMsgEm: c.ultima_msg_em,
      ultimoTexto: ultima.get(c.id)?.texto ?? null,
      ultimoAutor: (ultima.get(c.id)?.autor ?? null) as ChamadoResumo["ultimoAutor"],
      naoLida:
        !c.lida_equipe_em ||
        Date.parse(c.lida_equipe_em) < Date.parse(c.ultima_msg_em),
      mensagens: total.get(c.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        peso(a.status) - peso(b.status) ||
        Date.parse(b.ultimaMsgEm) - Date.parse(a.ultimaMsgEm),
    )
}

/** Abre o chamado e marca como lido. O raio-x vem AGORA, não o do histórico. */
export async function abrirChamado(id: string): Promise<ChamadoDetalhe | null> {
  const admin = await exigirEquipe()

  const { data: conv } = await admin
    .from("suporte_conversas")
    .select("id, holding_id, status")
    .eq("id", id)
    .maybeSingle()
  const c = conv as {
    id: string
    holding_id: string
    status: ChamadoResumo["status"]
  } | null
  if (!c) return null

  const [{ data: h }, { data: msgs }, raioX] = await Promise.all([
    admin.from("holdings").select("name").eq("id", c.holding_id).maybeSingle(),
    admin
      .from("suporte_mensagens")
      .select("id, autor, texto, criada_em")
      .eq("conversa_id", id)
      .order("criada_em"),
    // Estado de AGORA, não o que a IA viu quando respondeu: quem vai responder
    // precisa do que é verdade neste instante.
    montarRaioX(c.holding_id),
  ])

  await admin
    .from("suporte_conversas")
    .update({ lida_equipe_em: new Date().toISOString() })
    .eq("id", id)

  return {
    id,
    empresa: (h as { name: string } | null)?.name ?? "—",
    status: c.status,
    mensagens: ((msgs ?? []) as {
      id: string
      autor: "cliente" | "ia" | "equipe"
      texto: string
      criada_em: string
    }[]).map((m) => ({
      id: m.id,
      autor: m.autor,
      texto: m.texto,
      criadaEm: m.criada_em,
    })),
    raioX,
  }
}

export type AcaoState = { ok: boolean; erro?: string }

/**
 * Responder JÁ assume o chamado. Um botão "assumir" separado só existiria pra
 * ser esquecido — quem escreveu, assumiu.
 */
export async function responderChamado(
  id: string,
  texto: string,
): Promise<AcaoState> {
  const admin = await exigirEquipe()
  const msg = texto.trim()
  if (!msg) return { ok: false, erro: "Escreva a resposta." }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  await admin.from("suporte_mensagens").insert({
    conversa_id: id,
    autor: "equipe",
    user_id: data.user?.id ?? null,
    texto: msg,
  })
  await admin
    .from("suporte_conversas")
    .update({
      status: "com_humano",
      atendente_id: data.user?.id ?? null,
      ultima_msg_em: new Date().toISOString(),
      lida_equipe_em: new Date().toISOString(),
      lida_cliente_em: null,
    })
    .eq("id", id)

  revalidatePath("/suporte")
  return { ok: true }
}

export async function resolverChamado(id: string): Promise<AcaoState> {
  const admin = await exigirEquipe()
  await admin
    .from("suporte_conversas")
    .update({ status: "resolvida", resolvida_em: new Date().toISOString() })
    .eq("id", id)
  revalidatePath("/suporte")
  return { ok: true }
}

/** Devolve pra IA — pro caso de ter assumido sem querer. */
export async function devolverParaIa(id: string): Promise<AcaoState> {
  const admin = await exigirEquipe()
  await admin
    .from("suporte_conversas")
    .update({ status: "ia", atendente_id: null })
    .eq("id", id)
  revalidatePath("/suporte")
  return { ok: true }
}
