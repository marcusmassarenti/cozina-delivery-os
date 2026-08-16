import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { CAMPOS_CADASTRO, camposFaltando } from "@/lib/cadastro-campos"

/**
 * Lojas com cadastro pela metade.
 *
 * Existe porque a exigência de campo obrigatório passou a valer na EDIÇÃO
 * (09/08/26): quem abrir uma loja pra mudar o telefone vai descobrir ali que
 * faltam outros seis campos. Descobrir isso no meio de outra tarefa é o pior
 * momento possível — o aviso antecipa, dizendo quantas lojas precisam de
 * atenção antes da pessoa esbarrar nisso.
 *
 * ⚠️ A lista de campos NÃO mora mais aqui: veio pra `@/lib/cadastro-campos`
 * quando o selo por loja precisou da mesma resposta e a alternativa era uma
 * TERCEIRA cópia. `aplicarCadastroExigente` (o formulário) ainda tem a sua —
 * é a próxima a puxar pra lá.
 */

export type CadastroIncompleto = {
  /** Quantas lojas têm pelo menos um campo faltando. */
  lojas: number
  /** Total de campos faltando, somando todas. */
  campos: number
  /** As 5 com mais lacunas — é por onde começar. */
  piores: { unitId: string; codigo: string; nome: string; faltando: number }[]
  /**
   * Quantas lojas ATIVAS estão sem CNPJ — subconjunto das incompletas.
   *
   * Sai daqui e não da tela porque é a mesma leitura: a consulta já traz o
   * `cnpj` de todas as lojas do escopo. Contar de novo lá em cima significaria
   * a página carregar a rede inteira só pra isso — que é exatamente o que a
   * paginação acabou de tirar.
   */
  semCnpj: number
}

export async function getCadastroIncompleto(): Promise<CadastroIncompleto> {
  const vazio: CadastroIncompleto = {
    lojas: 0,
    campos: 0,
    piores: [],
    semCnpj: 0,
  }
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  let q = admin
    .from("units")
    .select(
      `id, code, name, active, data_inauguracao, ${CAMPOS_CADASTRO.join(", ")}`,
    )
    .eq("active", true)
  if (allowed !== null) {
    if (allowed.length === 0) return vazio
    q = q.in("id", allowed)
  }
  const { data } = await q
  const unidades = (data ?? []) as unknown as Record<string, unknown>[]
  if (unidades.length === 0) return vazio

  // Plataformas numa consulta só: uma por loja seriam 76 idas ao banco pra
  // responder "tem pelo menos uma?".
  const { data: plats } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("active", true)
  const comPlataforma = new Set(
    (plats ?? []).map((p) => p.unit_id as string).filter(Boolean),
  )

  const linhas = unidades.map((u) => {
    const faltando = camposFaltando(u, {
      temPlataforma: comPlataforma.has(u.id as string),
    }).length
    return {
      unitId: u.id as string,
      codigo: (u.code as string) ?? "—",
      nome: (u.name as string) ?? "—",
      faltando,
    }
  })

  // CNPJ conta como faltando quando está vazio OU incompleto: o campo aceita
  // texto, e "12.345" cadastrado pela metade não casa a loja com o iFood do
  // mesmo jeito que o vazio não casa.
  const semCnpj = unidades.filter(
    (u) => String(u.cnpj ?? "").replace(/\D/g, "").length !== 14,
  ).length

  const incompletas = linhas.filter((l) => l.faltando > 0)
  return {
    semCnpj,
    lojas: incompletas.length,
    campos: incompletas.reduce((s, l) => s + l.faltando, 0),
    piores: incompletas
      .slice()
      .sort((a, b) => b.faltando - a.faltando)
      .slice(0, 5),
  }
}
