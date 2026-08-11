import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Lojas de OUTRA empresa que um cliente acompanha (compartilhadas em leitura).
 *
 * Existe porque "quantas lojas esse cliente tem" passou a ter duas respostas:
 * as que são dele e as que ele acompanha. A cobrança usa a soma — acompanhar
 * uma loja consome as mesmas telas, relatórios e IA que uma loja própria — e a
 * tela de merchants usa a separação, pra ninguém achar que a loja emprestada
 * está conectada na conta de quem só olha.
 *
 * A marcação é `role='viewer'` numa linha de acesso de unidade (migration
 * 0186). Só conta loja ATIVA e de fora da própria holding: acesso à própria
 * loja não é compartilhamento, é o escopo normal.
 */

export type LojaCompartilhada = {
  unitId: string
  code: string
  name: string
  /** Empresa DONA da loja — não a que recebeu o acompanhamento. */
  donaId: string
  donaNome: string
}

/**
 * Lojas compartilhadas com cada holding, indexadas pelo id da holding que
 * RECEBEU o acesso. Uma consulta só: as telas e a cobrança pedem isso pra
 * várias empresas de uma vez.
 */
export async function getLojasCompartilhadasPorHolding(): Promise<
  Map<string, LojaCompartilhada[]>
> {
  const admin = createAdminClient()
  const out = new Map<string, LojaCompartilhada[]>()

  const { data: acessos } = await admin
    .from("user_unit_access")
    .select("user_id, scope_id")
    .eq("scope_type", "unit")
    .eq("role", "viewer")
  const linhas = (acessos ?? []) as { user_id: string; scope_id: string }[]
  if (linhas.length === 0) return out

  // De qual empresa é cada usuário que recebeu. Acesso de holding é o vínculo
  // que diz "esta pessoa é desta empresa".
  const { data: vinculos } = await admin
    .from("user_unit_access")
    .select("user_id, scope_id")
    .eq("scope_type", "holding")
    .in("user_id", [...new Set(linhas.map((l) => l.user_id))])
  const holdingDoUsuario = new Map<string, string>()
  for (const v of (vinculos ?? []) as { user_id: string; scope_id: string }[])
    holdingDoUsuario.set(v.user_id, v.scope_id)

  const { data: us } = await admin
    .from("units")
    .select("id, code, name, active, brands!inner(holding_id, holdings(name))")
    .in("id", [...new Set(linhas.map((l) => l.scope_id))])
  const unidade = new Map<string, LojaCompartilhada>()
  for (const u of (us ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    brands: { holding_id: string; holdings: { name: string } | null }
  }[]) {
    if (!u.active) continue
    unidade.set(u.id, {
      unitId: u.id,
      code: u.code,
      name: u.name,
      donaId: u.brands.holding_id,
      donaNome: u.brands.holdings?.name ?? "—",
    })
  }

  for (const l of linhas) {
    const holdingQueRecebeu = holdingDoUsuario.get(l.user_id)
    const loja = unidade.get(l.scope_id)
    if (!holdingQueRecebeu || !loja) continue
    // Própria loja não é compartilhamento.
    if (loja.donaId === holdingQueRecebeu) continue

    const lista = out.get(holdingQueRecebeu) ?? []
    // Duas pessoas da mesma empresa com acesso à mesma loja = UMA loja.
    if (!lista.some((x) => x.unitId === loja.unitId)) lista.push(loja)
    out.set(holdingQueRecebeu, lista)
  }
  return out
}

/** Quantas lojas de terceiros este cliente acompanha. Base da cobrança. */
export async function contarLojasCompartilhadas(
  holdingId: string,
): Promise<number> {
  const mapa = await getLojasCompartilhadasPorHolding()
  return (mapa.get(holdingId) ?? []).length
}
