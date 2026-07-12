/**
 * GET /api/v1/units — lista as lojas ativas (registro).
 * O `code` é o identificador estável pro ERP casar com o cadastro dele.
 * Requer chave de API com escopo "read".
 */
import { apiError, apiScopeUnitIds, verifyApiKey } from "@/lib/api/auth"
import { getUnits } from "@/lib/data/units"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth = await verifyApiKey(req, "read")
  if (!auth.ok) return apiError(auth.status, auth.error)
  const scope = await apiScopeUnitIds(auth.client)
  if (!scope.ok) return apiError(scope.status, scope.error)

  const allowed = new Set(scope.unitIds)
  const units = await getUnits()
  return Response.json({
    generatedAt: new Date().toISOString(),
    units: units
      .filter((u) => u.active && allowed.has(u.id))
      .map((u) => ({
        code: u.code,
        name: u.name,
        city: u.city,
        state: u.state,
      })),
  })
}
