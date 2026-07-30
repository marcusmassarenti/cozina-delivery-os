/**
 * Quantas lojas estão de fato conectadas em cada plataforma.
 *
 * Existe porque o painel de Conexões trazia esses números escritos à mão. O
 * texto dizia "4 de 18" na 99 Food quando o banco tinha 7 de 59 — envelheceu
 * calado e ninguém notou, porque número numa tela de status parece conferido.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ContagemConexoes = {
  ifoodVinculadas: number
  ifoodTotal: number
  noveVinculadas: number
  noveTotal: number
}

export async function contarLojasConectadas(): Promise<ContagemConexoes> {
  const admin = createAdminClient()

  const [ifoodTodas, ifoodComApi, noveTodas, noveLinks] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id", { count: "exact", head: true })
      .eq("platform", "ifood")
      .eq("active", true),
    admin
      .from("unit_platforms")
      .select("unit_id", { count: "exact", head: true })
      .eq("platform", "ifood")
      .eq("active", true)
      .not("api_store_id", "is", null),
    admin
      .from("unit_platforms")
      .select("unit_id", { count: "exact", head: true })
      .eq("platform", "99food")
      .eq("active", true),
    admin
      .from("ninefood_store_links")
      .select("unit_id", { count: "exact", head: true })
      .eq("active", true)
      .not("unit_id", "is", null),
  ])

  return {
    ifoodVinculadas: ifoodComApi.count ?? 0,
    ifoodTotal: ifoodTodas.count ?? 0,
    noveVinculadas: noveLinks.count ?? 0,
    noveTotal: noveTodas.count ?? 0,
  }
}
