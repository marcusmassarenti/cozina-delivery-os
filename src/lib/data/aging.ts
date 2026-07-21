import "server-only"

import {
  getCaixaHoldingId,
  getCardAccountIds,
  getEntries,
  type FinEntry,
  type Loja,
} from "@/lib/data/caixa"

/**
 * Aging de Contas a Pagar / a Receber — organiza os lançamentos EM ABERTO
 * (não pagos) por faixa de vencimento. É a visão que responde "o que já venceu
 * e há quanto tempo" e "o que vence quando" — some da lista mensal do Caixa.
 */

export type AgingBucketKey = "a_vencer" | "d1_30" | "d31_60" | "d61_90" | "d90p"

export type AgingBucket = {
  key: AgingBucketKey
  label: string
  vencido: boolean
  total: number
  count: number
  entries: FinEntry[]
}

export type AgingLado = {
  total: number
  count: number
  vencidoTotal: number
  buckets: AgingBucket[]
}

export type Aging = {
  pagar: AgingLado
  receber: AgingLado
}

const ORDER: { key: AgingBucketKey; label: string; vencido: boolean }[] = [
  { key: "a_vencer", label: "A vencer", vencido: false },
  { key: "d1_30", label: "Vencido 1–30 dias", vencido: true },
  { key: "d31_60", label: "Vencido 31–60 dias", vencido: true },
  { key: "d61_90", label: "Vencido 61–90 dias", vencido: true },
  { key: "d90p", label: "Vencido +90 dias", vencido: true },
]

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}
function diasAtraso(due: string, today: string): number {
  const a = new Date(`${due}T00:00:00-03:00`).getTime()
  const b = new Date(`${today}T00:00:00-03:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}
function bucketFor(due: string | null, today: string): AgingBucketKey {
  if (!due) return "a_vencer" // sem vencimento → trata como a vencer
  const d = diasAtraso(due, today)
  if (d <= 0) return "a_vencer"
  if (d <= 30) return "d1_30"
  if (d <= 60) return "d31_60"
  if (d <= 90) return "d61_90"
  return "d90p"
}

function buildLado(entries: FinEntry[], today: string): AgingLado {
  const map = new Map<AgingBucketKey, AgingBucket>()
  for (const o of ORDER)
    map.set(o.key, { ...o, total: 0, count: 0, entries: [] })
  let total = 0
  let count = 0
  let vencidoTotal = 0
  for (const e of entries) {
    const b = map.get(bucketFor(e.dueDate, today))!
    b.total += e.value
    b.count++
    b.entries.push(e)
    total += e.value
    count++
    if (b.vencido) vencidoTotal += e.value
  }
  // dentro do bucket, mais antigo primeiro (due_date asc; sem data no fim)
  for (const b of map.values())
    b.entries.sort((x, y) => (x.dueDate ?? "9999").localeCompare(y.dueDate ?? "9999"))
  return {
    total: Math.round(total * 100) / 100,
    count,
    vencidoTotal: Math.round(vencidoTotal * 100) / 100,
    buckets: ORDER.map((o) => map.get(o.key)!),
  }
}

export async function getAging(loja?: Loja): Promise<Aging | null> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const cardIds = await getCardAccountIds(holdingId)
  const pendentes = await getEntries(holdingId, {
    pendingOnly: true,
    excludeAccountIds: cardIds,
    loja,
  })
  const today = todayISO()
  return {
    pagar: buildLado(pendentes.filter((e) => e.kind === "despesa"), today),
    receber: buildLado(pendentes.filter((e) => e.kind === "receita"), today),
  }
}
