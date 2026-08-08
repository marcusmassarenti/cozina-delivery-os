/**
 * GET /api/v1/demanda-insumos?year=YYYY&month=M — demanda de insumos (ERP) por
 * loja no mês. Explode o que as lojas venderam no delivery pela ficha técnica
 * (de-para cadastrado no Delivery OS) e devolve a quantidade de cada insumo
 * (código CNP) que cada loja "consumiu". É o sinal de demanda pro ERP gerar
 * OPs / repor estoque. Requer chave de API com escopo "read".
 *
 * Default: mês corrente se year/month não vierem.
 */
import { apiError, apiScopeUnitIds, verifyApiKey } from "@/lib/api/auth"
import { getDemandaInsumos } from "@/lib/data/producao"
import { currentPeriod } from "@/lib/period"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseIntParam(v: string | null): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(req: Request) {
  const auth = await verifyApiKey(req, "read")
  if (!auth.ok) return apiError(auth.status, auth.error)
  const scope = await apiScopeUnitIds(auth.client)
  if (!scope.ok) return apiError(scope.status, scope.error)

  const url = new URL(req.url)
  const cur = currentPeriod()
  const year = parseIntParam(url.searchParams.get("year")) ?? cur.year
  const month = parseIntParam(url.searchParams.get("month")) ?? cur.month
  if (month < 1 || month > 12) {
    return apiError(400, "Parâmetro 'month' inválido (use 1 a 12).")
  }
  if (year < 2000 || year > 2100) {
    return apiError(400, "Parâmetro 'year' inválido.")
  }

  // A holding vem da CHAVE, não de sessão: este endpoint é o ERP puxando, sem
  // usuário logado. Sem passar explicitamente, a ficha técnica sairia vazia.
  const d = await getDemandaInsumos(
    year,
    month,
    scope.unitIds,
    auth.client.holdingId,
  )

  return Response.json({
    period: { year, month },
    generatedAt: new Date().toISOString(),
    // Demanda explodida por loja × insumo (código do ERP).
    demanda: d.linhas.map((l) => ({
      loja: l.unitCode,
      lojaNome: l.unitName,
      codigo: l.insumoCodigo,
      insumo: l.insumoNome,
      unidade: l.unidade,
      qtd: r2(l.qtd),
    })),
    // Itens vendidos SEM ficha técnica — não entram na demanda (cadastrar).
    naoMapeados: d.naoMapeados.map((n) => ({
      plataforma: n.platform,
      nomeItem: n.nomeItem,
      qtd: r2(n.qtd),
    })),
  })
}
