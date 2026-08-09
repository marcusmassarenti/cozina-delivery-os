import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"

/**
 * Lojas com cadastro pela metade.
 *
 * Existe porque a exigência de campo obrigatório passou a valer na EDIÇÃO
 * (09/08/26): quem abrir uma loja pra mudar o telefone vai descobrir ali que
 * faltam outros seis campos. Descobrir isso no meio de outra tarefa é o pior
 * momento possível — o aviso antecipa, dizendo quantas lojas precisam de
 * atenção antes da pessoa esbarrar nisso.
 *
 * ⚠️ NÃO conta `complemento`: muito endereço não tem, e cobrar geraria "-".
 * A lista aqui é exatamente a mesma de `aplicarCadastroExigente` — se mudar
 * lá, muda aqui, senão o aviso passa a mentir em uma das duas direções.
 */

export type CadastroIncompleto = {
  /** Quantas lojas têm pelo menos um campo faltando. */
  lojas: number
  /** Total de campos faltando, somando todas. */
  campos: number
  /** As 5 com mais lacunas — é por onde começar. */
  piores: { unitId: string; codigo: string; nome: string; faltando: number }[]
}

const CAMPOS_TEXTO = [
  "cnpj",
  "razao_social",
  "tipo_cozinha",
  "logradouro",
  "numero",
  "bairro",
  "cep",
  "telefone",
  "responsavel_nome",
  "responsavel_email",
  "tipo_operacao",
  "regime_fiscal",
  "tipo_entrega",
] as const

export async function getCadastroIncompleto(): Promise<CadastroIncompleto> {
  const vazio: CadastroIncompleto = { lojas: 0, campos: 0, piores: [] }
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  let q = admin
    .from("units")
    .select(
      `id, code, name, active, data_inauguracao, ${CAMPOS_TEXTO.join(", ")}`,
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
    let faltando = 0
    for (const c of CAMPOS_TEXTO) {
      const v = u[c]
      if (v === null || v === undefined || String(v).trim() === "") faltando++
    }
    if (!u.data_inauguracao) faltando++
    if (!comPlataforma.has(u.id as string)) faltando++
    return {
      unitId: u.id as string,
      codigo: (u.code as string) ?? "—",
      nome: (u.name as string) ?? "—",
      faltando,
    }
  })

  const incompletas = linhas.filter((l) => l.faltando > 0)
  return {
    lojas: incompletas.length,
    campos: incompletas.reduce((s, l) => s + l.faltando, 0),
    piores: incompletas
      .slice()
      .sort((a, b) => b.faltando - a.faltando)
      .slice(0, 5),
  }
}
