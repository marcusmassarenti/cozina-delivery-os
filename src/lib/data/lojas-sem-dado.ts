/**
 * Lojas que marcaram uma plataforma no cadastro e nunca trouxeram dado.
 *
 * NÃO é falha de integração — é dado que o cliente disse que existe e não
 * entregou. Fica fora do painel de saúde de propósito: lá o vermelho é pra
 * coisa que quebrou, e misturar as duas foi o que fez o resumo dizer "12/58"
 * quando havia 7 lojas conectadas, todas em dia.
 *
 * Parte disso é cadastro errado (marcou Keeta e nunca vendeu na Keeta), então
 * o aviso sempre vem junto da saída "não vendo nessa plataforma".
 */
import "server-only"

import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export type LojaSemDado = {
  unitId: string
  code: string
  nome: string
  plataforma: "ifood" | "99food" | "keeta"
}

export async function getLojasSemDado(
  unitIds: string[],
): Promise<LojaSemDado[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()

  // Escopo do usuário: franqueado não pode ver (nem desmarcar) loja alheia.
  const acessiveis = await getAccessibleUnitIds()
  const alvo =
    acessiveis === null ? unitIds : unitIds.filter((id) => acessiveis.includes(id))
  if (alvo.length === 0) return []

  const { data, error } = await admin.rpc("lojas_sem_dado", { p_unit_ids: alvo })
  if (error) {
    console.error("getLojasSemDado:", error.message)
    return []
  }
  const linhas = (data ?? []) as { unit_id: string; plataforma: string }[]
  if (linhas.length === 0) return []

  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", [...new Set(linhas.map((l) => l.unit_id))])
  const porId = new Map(
    ((units ?? []) as { id: string; code: string; name: string }[]).map((u) => [
      u.id,
      u,
    ]),
  )

  return linhas
    .map((l) => ({
      unitId: l.unit_id,
      code: porId.get(l.unit_id)?.code ?? "",
      nome: porId.get(l.unit_id)?.name ?? "loja",
      plataforma: l.plataforma as LojaSemDado["plataforma"],
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
