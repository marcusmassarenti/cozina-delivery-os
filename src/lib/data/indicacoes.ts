/**
 * Programa de indicação: quem trouxe quem, e quanto se deve a quem.
 *
 * Duas regras que definem o desenho:
 *
 * 1. A comissão só nasce quando a fatura do indicado é PAGA. Comissão sobre
 *    fatura em aberto seria promessa, não dívida — e você acabaria pagando
 *    Pix por cliente que nunca pagou.
 *
 * 2. O indicador não precisa ser cliente. Como o pagamento é Pix por fora, um
 *    consultor pode indicar sem ter conta aqui. Quando ele também é cliente
 *    (o Diego, da DG Foods), o vínculo com a holding dele fica registrado.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type Indicador = {
  id: string
  nome: string
  codigo: string
  pixChave: string | null
  contato: string | null
  comissaoPct: number
  descontoPct: number
  ativo: boolean
  holdingId: string | null
  nota: string | null
  criadoEm: string
  /** Clientes que entraram por este código. */
  indicados: { holdingId: string; nome: string; em: string; pagante: boolean }[]
  aPagar: number
  jaPago: number
}

export type Comissao = {
  id: string
  indicadorId: string
  indicador: string
  pixChave: string | null
  cliente: string
  competencia: string
  baseValor: number
  pct: number
  valor: number
  status: string
  pagoEm: string | null
}

/** Normaliza o código: ninguém digita cupom com o mesmo capricho duas vezes. */
export function normalizarCodigo(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "")
}

/** Acha o indicador de um código digitado no cadastro. null = código inválido. */
export async function acharIndicadorPorCodigo(
  codigo: string,
): Promise<{ id: string; descontoPct: number } | null> {
  const cod = normalizarCodigo(codigo)
  if (!cod) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("indicadores")
      .select("id, codigo, desconto_pct, ativo")
      .eq("ativo", true)
    const achado = ((data ?? []) as Record<string, unknown>[]).find(
      (i) => normalizarCodigo(String(i.codigo)) === cod,
    )
    if (!achado) return null
    return {
      id: String(achado.id),
      descontoPct: Number(achado.desconto_pct ?? 0),
    }
  } catch (e) {
    // Cupom inválido nunca pode impedir um cadastro: o cliente entra sem
    // desconto e você resolve depois. Barrar a conta seria perder a venda.
    console.error("acharIndicadorPorCodigo:", e)
    return null
  }
}

export async function listarIndicadores(): Promise<Indicador[]> {
  const admin = createAdminClient()
  const [{ data: inds }, { data: holds }, { data: coms }] = await Promise.all([
    admin.from("indicadores").select("*").order("criado_em", { ascending: false }),
    admin.from("holdings").select("id, name, indicado_por, indicado_em, paid"),
    admin.from("comissoes").select("indicador_id, valor, status"),
  ])

  const porIndicador = new Map<string, Indicador["indicados"]>()
  for (const h of (holds ?? []) as Record<string, unknown>[]) {
    const ind = h.indicado_por as string | null
    if (!ind) continue
    if (!porIndicador.has(ind)) porIndicador.set(ind, [])
    porIndicador.get(ind)!.push({
      holdingId: String(h.id),
      nome: String(h.name),
      em: String(h.indicado_em ?? ""),
      pagante: Boolean(h.paid),
    })
  }

  const soma = (id: string, status: string) =>
    ((coms ?? []) as Record<string, unknown>[])
      .filter((c) => c.indicador_id === id && c.status === status)
      .reduce((s, c) => s + Number(c.valor ?? 0), 0)

  return ((inds ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    nome: String(i.nome),
    codigo: String(i.codigo),
    pixChave: (i.pix_chave as string | null) ?? null,
    contato: (i.contato as string | null) ?? null,
    comissaoPct: Number(i.comissao_pct ?? 0),
    descontoPct: Number(i.desconto_pct ?? 0),
    ativo: Boolean(i.ativo),
    holdingId: (i.holding_id as string | null) ?? null,
    nota: (i.nota as string | null) ?? null,
    criadoEm: String(i.criado_em),
    indicados: porIndicador.get(String(i.id)) ?? [],
    aPagar: soma(String(i.id), "a_pagar"),
    jaPago: soma(String(i.id), "paga"),
  }))
}

export async function listarComissoes(limite = 100): Promise<Comissao[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("comissoes")
    .select("*")
    .order("competencia", { ascending: false })
    .limit(limite)

  const ids = [...new Set(((data ?? []) as Record<string, unknown>[]).flatMap((c) => [
    String(c.indicador_id),
  ]))]
  const hids = [...new Set(((data ?? []) as Record<string, unknown>[]).map((c) => String(c.holding_id)))]

  const [{ data: inds }, { data: holds }] = await Promise.all([
    admin.from("indicadores").select("id, nome, pix_chave").in("id", ids.length ? ids : ["-"]),
    admin.from("holdings").select("id, name").in("id", hids.length ? hids : ["-"]),
  ])
  const nomeInd = new Map(
    ((inds ?? []) as Record<string, unknown>[]).map((i) => [
      String(i.id),
      { nome: String(i.nome), pix: (i.pix_chave as string | null) ?? null },
    ]),
  )
  const nomeHold = new Map(
    ((holds ?? []) as Record<string, unknown>[]).map((h) => [String(h.id), String(h.name)]),
  )

  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    indicadorId: String(c.indicador_id),
    indicador: nomeInd.get(String(c.indicador_id))?.nome ?? "—",
    pixChave: nomeInd.get(String(c.indicador_id))?.pix ?? null,
    cliente: nomeHold.get(String(c.holding_id)) ?? "—",
    competencia: String(c.competencia),
    baseValor: Number(c.base_valor ?? 0),
    pct: Number(c.pct ?? 0),
    valor: Number(c.valor ?? 0),
    status: String(c.status),
    pagoEm: (c.pago_em as string | null) ?? null,
  }))
}

/**
 * Apura comissões das faturas PAGAS que ainda não geraram uma.
 *
 * Idempotente pelo índice único (indicador, cliente, competência): rodar duas
 * vezes não paga em dobro. Best-effort — nunca lança, porque isto roda dentro
 * de um cron que tem outras responsabilidades.
 */
export async function apurarComissoes(): Promise<{
  criadas: { indicador: string; cliente: string; competencia: string; valor: number }[]
}> {
  const out: { criadas: { indicador: string; cliente: string; competencia: string; valor: number }[] } = {
    criadas: [],
  }
  try {
    const admin = createAdminClient()

    const { data: holds } = await admin
      .from("holdings")
      .select("id, name, indicado_por")
      .not("indicado_por", "is", null)
    const indicados = (holds ?? []) as Record<string, unknown>[]
    if (!indicados.length) return out

    const hids = indicados.map((h) => String(h.id))
    const [{ data: faturas }, { data: inds }, { data: jaTem }] = await Promise.all([
      admin
        .from("holding_invoices")
        .select("holding_id, competencia, valor, status")
        .in("holding_id", hids)
        .eq("status", "paga"),
      admin.from("indicadores").select("id, nome, comissao_pct, ativo"),
      admin.from("comissoes").select("indicador_id, holding_id, competencia, status"),
    ])

    const indPorId = new Map(
      ((inds ?? []) as Record<string, unknown>[]).map((i) => [String(i.id), i]),
    )
    const existe = new Set(
      ((jaTem ?? []) as Record<string, unknown>[])
        .filter((c) => c.status !== "cancelada")
        .map((c) => `${c.indicador_id}|${c.holding_id}|${c.competencia}`),
    )
    const nomeHold = new Map(indicados.map((h) => [String(h.id), String(h.name)]))
    const indDaHold = new Map(indicados.map((h) => [String(h.id), String(h.indicado_por)]))

    for (const f of (faturas ?? []) as Record<string, unknown>[]) {
      const hid = String(f.holding_id)
      const indId = indDaHold.get(hid)
      if (!indId) continue
      const ind = indPorId.get(indId)
      if (!ind || !ind.ativo) continue

      const chave = `${indId}|${hid}|${f.competencia}`
      if (existe.has(chave)) continue

      const base = Number(f.valor ?? 0)
      const pct = Number(ind.comissao_pct ?? 0)
      const valor = Math.round(base * pct) / 100

      const { error } = await admin.from("comissoes").insert({
        indicador_id: indId,
        holding_id: hid,
        competencia: String(f.competencia),
        base_valor: base,
        pct,
        valor,
      })
      if (!error) {
        existe.add(chave)
        out.criadas.push({
          indicador: String(ind.nome),
          cliente: nomeHold.get(hid) ?? "—",
          competencia: String(f.competencia),
          valor,
        })
      }
    }
  } catch (e) {
    console.error("apurarComissoes:", e)
  }
  return out
}
