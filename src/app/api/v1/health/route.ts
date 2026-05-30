/**
 * GET /api/v1/health — checagem de conectividade (sem auth).
 * Útil pro time do ERP testar que a API está no ar.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({
    ok: true,
    service: "cozina-delivery-os",
    api: "v1",
    time: new Date().toISOString(),
  })
}
