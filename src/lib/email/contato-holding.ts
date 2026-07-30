/**
 * Quem fala pelo cliente: o administrador da holding.
 *
 * A régua de e-mail (`lib/data/regua-email.ts`) resolve isso pra TODAS as
 * holdings de uma vez, porque roda em lote no cron. Aqui é o caso avulso —
 * um aviso disparado por uma ação de tela, pra uma holding só.
 *
 * A regra de escolha é a mesma da régua, de propósito: escopo de holding com
 * papel de admin vence; empate desempata pelo cadastro mais antigo, que é quem
 * abriu a conta. Se mudar lá, muda aqui.
 *
 * ⚠️ user_unit_access NÃO tem foreign key nenhuma, então o PostgREST não faz o
 * join — a relação unidade → marca → holding é remontada na mão.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ContatoHolding = { email: string; nome: string | null }

export async function contatoDaHolding(
  holdingId: string,
): Promise<ContatoHolding | null> {
  const admin = createAdminClient()

  const { data: brandsRel } = await admin
    .from("brands")
    .select("id, holding_id")
    .eq("holding_id", holdingId)
  const brandIds = new Set(
    ((brandsRel ?? []) as { id: string }[]).map((b) => b.id),
  )

  const { data: unitsRel } = await admin.from("units").select("id, brand_id")
  const unitIds = new Set(
    ((unitsRel ?? []) as { id: string; brand_id: string }[])
      .filter((u) => brandIds.has(u.brand_id))
      .map((u) => u.id),
  )

  const { data: acessos, error } = await admin
    .from("user_unit_access")
    .select("user_id, scope_type, scope_id, role")
  if (error) {
    console.error("contatoDaHolding: acessos", error.message)
    return null
  }

  /** Menor número = melhor contato. */
  const prioridade = (scope: string, role: string) =>
    scope === "holding" && role === "admin" ? 1 : scope === "holding" ? 2 : 3

  const candidatos: { userId: string; peso: number }[] = []
  for (const a of (acessos ?? []) as {
    user_id: string
    scope_type: string
    scope_id: string
    role: string
  }[]) {
    const pertence =
      a.scope_type === "holding"
        ? a.scope_id === holdingId
        : a.scope_type === "brand"
          ? brandIds.has(a.scope_id)
          : unitIds.has(a.scope_id)
    if (!pertence) continue
    candidatos.push({
      userId: a.user_id,
      peso: prioridade(a.scope_type, a.role),
    })
  }
  if (candidatos.length === 0) return null

  const { data: lista } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  const porId = new Map(
    (lista?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? "",
        nome: (u.user_metadata?.full_name as string | null) ?? null,
        confirmado: Boolean(u.email_confirmed_at),
        criadoEm: u.created_at,
      },
    ]),
  )

  const ordenados = candidatos.slice().sort(
    (a, b) =>
      a.peso - b.peso ||
      Date.parse(porId.get(a.userId)?.criadoEm ?? "") -
        Date.parse(porId.get(b.userId)?.criadoEm ?? ""),
  )

  // Só quem confirmou o e-mail: mandar pra caixa não confirmada é queimar
  // reputação de domínio à toa, e a pessoa não conseguiria entrar mesmo.
  const escolhido = ordenados
    .map((c) => porId.get(c.userId))
    .find((u) => u?.email && u.confirmado)

  return escolhido ? { email: escolhido.email, nome: escolhido.nome } : null
}
