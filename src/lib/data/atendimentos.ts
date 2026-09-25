import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  TIPOS,
  type Atendimento,
  type GestorSimples,
  type Passo,
  type TipoAtendimento,
} from "./atendimentos-tipos"

/**
 * Atendimentos — T6 do painel da agência.
 *
 * Pedido direto do Marcus: "deixar gravado cada passo que é feito na loja".
 * O histórico é append-only porque é isso que dá valor ao registro: quando o
 * lojista pergunta o que foi feito em julho, passo editável não prova nada.
 */

const rotulo = (t: string) => TIPOS.find((x) => x.id === t)?.label ?? t

function dias(de: string, ate: string | null): number {
  const fim = ate ? new Date(ate).getTime() : Date.now()
  return Math.max(0, Math.floor((fim - new Date(de).getTime()) / 86400000))
}

export async function listarAtendimentos(opts?: {
  unitId?: string
  incluirResolvidos?: boolean
}): Promise<Atendimento[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const admin = createAdminClient()

  /* ⚠️ SEMPRE pela holding da sessão, mesmo quando vem unitId. Sem isso um id
     colado na URL leria o atendimento de outro cliente — e atendimento tem
     texto livre sobre a operação de quem paga. */
  let q = admin
    .from("atendimentos")
    .select(
      "id, unit_id, tipo, titulo, aberto_em, resolvido_em, gestor_id, gestores(nome), units!inner(code, name, brands!inner(holding_id))",
    )
    .eq("units.brands.holding_id", holdingId)
    .order("aberto_em", { ascending: false })
  if (opts?.unitId) q = q.eq("unit_id", opts.unitId)
  if (!opts?.incluirResolvidos) q = q.is("resolvido_em", null)

  const { data } = await q
  const linhas = (data ?? []) as unknown as {
    id: string
    unit_id: string
    tipo: TipoAtendimento
    titulo: string
    aberto_em: string
    resolvido_em: string | null
    gestor_id: string | null
    gestores: { nome: string } | null
    units: { code: string; name: string }
  }[]
  if (linhas.length === 0) return []

  const { data: passosRaw } = await admin
    .from("atendimento_passos")
    .select("id, atendimento_id, texto, autor_nome, criado_em")
    .in(
      "atendimento_id",
      linhas.map((l) => l.id),
    )
    .order("criado_em")

  const porAtendimento = new Map<string, Passo[]>()
  for (const p of (passosRaw ?? []) as {
    id: string
    atendimento_id: string
    texto: string
    autor_nome: string | null
    criado_em: string
  }[]) {
    porAtendimento.set(p.atendimento_id, [
      ...(porAtendimento.get(p.atendimento_id) ?? []),
      { id: p.id, texto: p.texto, autorNome: p.autor_nome, criadoEm: p.criado_em },
    ])
  }

  return linhas.map((l) => ({
    id: l.id,
    unitId: l.unit_id,
    code: l.units.code,
    loja: l.units.name,
    tipo: l.tipo,
    tipoLabel: rotulo(l.tipo),
    titulo: l.titulo,
    abertoEm: l.aberto_em,
    resolvidoEm: l.resolvido_em,
    dias: dias(l.aberto_em, l.resolvido_em),
    passos: porAtendimento.get(l.id) ?? [],
    gestorId: l.gestor_id,
    gestorNome: l.gestores?.nome ?? null,
  }))
}

/** Gestores ativos da agência da sessão — as opções de responsável. */
export async function listarGestoresAtivos(): Promise<GestorSimples[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("gestores")
    .select("id, nome")
    .eq("holding_id", holdingId)
    .eq("ativo", true)
    .order("nome")
  return ((data ?? []) as { id: string; nome: string }[]).map((g) => ({
    id: g.id,
    nome: g.nome,
  }))
}

/**
 * O gestor ligado ao login de quem está vendo, se houver.
 *
 * Gestor não precisa de login (0243), mas quando tem, a tela de atendimentos
 * abre já filtrada nos dele — é a "tela do gestor" que o Marcus pediu.
 */
export async function meuGestorId(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const { data } = await createAdminClient()
    .from("gestores")
    .select("id")
    .eq("holding_id", holdingId)
    .eq("user_id", userId)
    .eq("ativo", true)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Quantos atendimentos abertos cada loja tem — a T2 mostra isso no cartão. */
export async function abertosPorLoja(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return out
  const { data } = await createAdminClient()
    .from("atendimentos")
    .select("unit_id, units!inner(brands!inner(holding_id))")
    .eq("units.brands.holding_id", holdingId)
    .is("resolvido_em", null)
  for (const r of (data ?? []) as unknown as { unit_id: string }[]) {
    out.set(r.unit_id, (out.get(r.unit_id) ?? 0) + 1)
  }
  return out
}

export { TIPOS }
export type { Atendimento, Passo, TipoAtendimento }
