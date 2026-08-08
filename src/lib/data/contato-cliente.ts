import "server-only"

/**
 * Quem é o contato de cada cliente (holding) para e-mails automáticos.
 *
 * Vale a pena existir separado porque a resposta NÃO é óbvia e já custou caro
 * uma vez. O que parece: "pega o e-mail do perfil". O que é de verdade:
 *
 *  • `profiles` não guarda e-mail nem holding — o e-mail vive em `auth.users`
 *    e o vínculo em `user_unit_access`. Escrevi uma primeira versão lendo
 *    `profiles.email` e ela quebraria em produção.
 *  • `user_unit_access` NÃO tem foreign key nenhuma, então o PostgREST não faz
 *    join: a cadeia unit → brand → holding tem que ser remontada na mão. Uma
 *    versão anterior da régua tentou `units!inner(...)`, o PostgREST devolveu
 *    erro, o código leu só `data` e seguiu com lista vazia — e ninguém era
 *    encontrado, calado.
 *  • O acesso pode ser em três escopos (holding, brand, unit), e o contato
 *    certo é o administrador da holding. Empate acontece de verdade (a
 *    Empreender tem dois) e desempata pelo mais antigo: é quem abriu a conta.
 *
 * ⚠️ `src/lib/data/regua-email.ts` tem esta mesma lógica embutida, escrita
 * antes. Não unifiquei junto com esta mudança de propósito: aquele arquivo
 * dispara COBRANÇA, e trocar a resolução de destinatário dele no meio de uma
 * task de relatório é arriscar mandar fatura pra pessoa errada. Fica marcado
 * pra consolidar em separado.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export type ContatoCliente = {
  holdingId: string
  nomeCliente: string
  email: string
  nome: string | null
  /** false = achamos alguém, mas o e-mail nunca foi confirmado. */
  confirmado: boolean
}

/** Menor número = melhor contato. */
const prioridade = (scope: string, role: string) =>
  scope === "holding" && role === "admin" ? 1 : scope === "holding" ? 2 : 3

export async function contatosPorHolding(): Promise<Map<string, ContatoCliente>> {
  const admin = createAdminClient()
  const out = new Map<string, ContatoCliente>()

  const [{ data: holdings }, { data: brands }, { data: units }, { data: acessos }] =
    await Promise.all([
      admin.from("holdings").select("id, name"),
      admin.from("brands").select("id, holding_id"),
      admin.from("units").select("id, brand_id"),
      admin.from("user_unit_access").select("user_id, scope_type, scope_id, role"),
    ])

  const holdingDaBrand = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [
      b.id,
      b.holding_id,
    ]),
  )
  const holdingDaUnit = new Map(
    ((units ?? []) as { id: string; brand_id: string }[])
      .map((u) => [u.id, holdingDaBrand.get(u.brand_id)])
      .filter((p): p is [string, string] => Boolean(p[1])),
  )

  const candidatos = new Map<string, { userId: string; peso: number }[]>()
  for (const a of (acessos ?? []) as {
    user_id: string
    scope_type: string
    scope_id: string
    role: string
  }[]) {
    const h =
      a.scope_type === "holding"
        ? a.scope_id
        : a.scope_type === "brand"
          ? holdingDaBrand.get(a.scope_id)
          : holdingDaUnit.get(a.scope_id)
    if (!h) continue
    if (!candidatos.has(h)) candidatos.set(h, [])
    candidatos.get(h)!.push({ userId: a.user_id, peso: prioridade(a.scope_type, a.role) })
  }

  try {
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const porId = new Map(
      (lista?.users ?? []).map((u) => [
        u.id,
        {
          email: u.email ?? "",
          nome: (u.user_metadata?.full_name as string | null) ?? null,
          confirmado: Boolean(u.email_confirmed_at),
          company: (u.user_metadata?.company as string | null) ?? null,
          criadoEm: u.created_at,
        },
      ]),
    )

    for (const h of (holdings ?? []) as { id: string; name: string }[]) {
      const ordenados = (candidatos.get(h.id) ?? []).slice().sort(
        (a, b) =>
          a.peso - b.peso ||
          Date.parse(porId.get(a.userId)?.criadoEm ?? "") -
            Date.parse(porId.get(b.userId)?.criadoEm ?? ""),
      )

      const achado =
        ordenados.map((c) => porId.get(c.userId)).find((u) => u?.email && u.confirmado) ??
        // Plano B: casar pelo nome da empresa no cadastro. Cobre o cliente que
        // assinou mas ainda não teve acesso criado.
        [...porId.values()].find((u) => u.confirmado && u.company && u.company === h.name) ??
        ordenados.map((c) => porId.get(c.userId)).find((u) => u?.email)

      if (achado?.email) {
        out.set(h.id, {
          holdingId: h.id,
          nomeCliente: h.name,
          email: achado.email,
          nome: achado.nome,
          confirmado: achado.confirmado,
        })
      }
    }
  } catch (e) {
    console.error("contatosPorHolding: listUsers falhou", e)
  }

  return out
}
