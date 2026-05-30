/**
 * GET /api/v1/faturamento?year=YYYY&month=M — faturamento/resultado da rede
 * no mês, por loja + totais. Contrato estável (desacoplado dos tipos internos).
 * Requer chave de API com escopo "read".
 *
 * Default: mês corrente se year/month não vierem.
 */
import { apiError, verifyApiKey } from "@/lib/api/auth"
import { getNetworkResultadoForMonth } from "@/lib/data/resultado"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseIntParam(v: string | null): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** Arredonda pra 2 casas (centavos) — evita ruído de ponto flutuante no JSON. */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(req: Request) {
  const auth = await verifyApiKey(req, "read")
  if (!auth.ok) return apiError(auth.status, auth.error)

  const url = new URL(req.url)
  const now = new Date()
  const year = parseIntParam(url.searchParams.get("year")) ?? now.getFullYear()
  const month =
    parseIntParam(url.searchParams.get("month")) ?? now.getMonth() + 1
  if (month < 1 || month > 12) {
    return apiError(400, "Parâmetro 'month' inválido (use 1 a 12).")
  }
  if (year < 2000 || year > 2100) {
    return apiError(400, "Parâmetro 'year' inválido.")
  }

  const r = await getNetworkResultadoForMonth(year, month)

  return Response.json({
    period: { year, month },
    generatedAt: new Date().toISOString(),
    moeda: "BRL",
    totals: {
      pedidos: r.totals.pedidos,
      faturamentoBruto: r2(r.totals.bruto),
      taxasPlataforma: r2(r.totals.taxasPlataforma),
      liquido: r2(r.totals.totalLiquido),
      cmv: r2(r.totals.cmvTotal),
      custoOperacao: r2(r.totals.custoOperacao),
      margemLiquida: r2(r.totals.margemLiquida),
      resultadoOperacional: r2(r.totals.resultadoOperacional),
    },
    units: r.rows.map((u) => ({
      code: u.unitCode,
      name: u.unitName,
      pedidos: u.pedidos,
      faturamentoBruto: r2(u.bruto),
      taxasPlataforma: r2(u.taxasPlataforma),
      liquido: r2(u.totalLiquido),
      cmv: r2(u.cmvTotal),
      custoOperacao: r2(u.custoOperacao),
      margemLiquida: r2(u.margemLiquida),
      resultadoOperacional: r2(u.resultadoOperacional),
    })),
  })
}
