import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { custoDoItem, type NFParsed } from "@/lib/nf/parse-xml"

export type RegimeFiscal = "simples" | "normal"

export type NFResumo = {
  id: string
  chave: string
  numero: string | null
  serie: string | null
  emissao: string | null
  emitNome: string | null
  destCnpj: string | null
  destNome: string | null
  unitId: string | null
  unitNome: string | null
  valorTotal: number
  itens: number
}

export type Insumo = {
  id: string
  codigo: string
  nome: string
  ncm: string | null
  unidadeCompra: string
  unidadeUso: string | null
  fatorConversao: number | null
  custoCompra: number | null
  custoAtual: number | null
  custoEm: string | null
  /** Quantas notas já trouxeram este insumo — dá confiança ao custo. */
  notas: number
}

/** UUID que não existe — filtro "nenhuma loja". Array vazio no PostgREST vira
 *  "sem filtro", que traria a rede inteira. */
const UNIT_INEXISTENTE = "00000000-0000-0000-0000-000000000000"

export async function getNotas(holdingId: string): Promise<NFResumo[]> {
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  let q = admin
    .from("nf_documentos")
    .select(
      "id, chave, numero, serie, emissao, emit_nome, dest_cnpj, dest_nome, unit_id, valor_total, nf_itens(count)",
    )
    .eq("holding_id", holdingId)
    .order("emissao", { ascending: false })
    .limit(200)

  // Franqueado vê as notas das lojas dele -- e as ainda não vinculadas, que
  // podem ser dele: esconder nota sem dono faria a fila de pendências sumir
  // justamente pra quem precisa resolver.
  if (allowed !== null) {
    const ids = allowed.length ? allowed : [UNIT_INEXISTENTE]
    q = q.or(`unit_id.in.(${ids.join(",")}),unit_id.is.null`)
  }

  const { data, error } = await q
  if (error) throw new Error(`notas fiscais — ${error.message}`)

  const unitIds = [
    ...new Set((data ?? []).map((n) => n.unit_id).filter(Boolean) as string[]),
  ]
  const nomes = new Map<string, string>()
  if (unitIds.length) {
    const { data: units } = await admin
      .from("units")
      .select("id, name")
      .in("id", unitIds)
    for (const u of units ?? []) nomes.set(u.id as string, u.name as string)
  }

  return (data ?? []).map((n) => ({
    id: n.id as string,
    chave: n.chave as string,
    numero: n.numero as string | null,
    serie: n.serie as string | null,
    emissao: n.emissao as string | null,
    emitNome: n.emit_nome as string | null,
    destCnpj: n.dest_cnpj as string | null,
    destNome: n.dest_nome as string | null,
    unitId: n.unit_id as string | null,
    unitNome: n.unit_id ? (nomes.get(n.unit_id as string) ?? null) : null,
    valorTotal: Number(n.valor_total ?? 0),
    itens:
      (n.nf_itens as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

export async function getInsumos(holdingId: string): Promise<Insumo[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("insumos")
    .select(
      "id, codigo, nome, ncm, unidade_compra, unidade_uso, fator_conversao, custo_compra, custo_atual, custo_em, nf_itens(count)",
    )
    .eq("holding_id", holdingId)
    .order("nome")
  if (error) throw new Error(`insumos — ${error.message}`)

  return (data ?? []).map((i) => ({
    id: i.id as string,
    codigo: i.codigo as string,
    nome: i.nome as string,
    ncm: i.ncm as string | null,
    unidadeCompra: i.unidade_compra as string,
    unidadeUso: i.unidade_uso as string | null,
    fatorConversao: i.fator_conversao === null ? null : Number(i.fator_conversao),
    custoCompra: i.custo_compra === null ? null : Number(i.custo_compra),
    custoAtual: i.custo_atual === null ? null : Number(i.custo_atual),
    custoEm: i.custo_em as string | null,
    notas:
      (i.nf_itens as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

/** Loja cujo CNPJ bate com o destinatário da nota. Null = ainda não sabemos. */
export async function unidadePeloCnpj(
  holdingId: string,
  cnpj: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!cnpj) return null
  const admin = createAdminClient()
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id as string)
  if (!brandIds.length) return null

  // Compara só dígitos: o cadastro guarda com máscara ("12.345.678/0001-90") e
  // a nota vem sem. Comparar cru nunca casaria.
  const { data } = await admin
    .from("units")
    .select("id, name, cnpj")
    .in("brand_id", brandIds)
  for (const u of data ?? []) {
    const d = String(u.cnpj ?? "").replace(/\D/g, "")
    if (d && d === cnpj) return { id: u.id as string, name: u.name as string }
  }
  return null
}

export type ImportarResultado = {
  nfId: string
  loja: string | null
  itens: number
  insumosNovos: number
  insumosAtualizados: number
  cnpjAprendido: boolean
  avisos: string[]
}

/**
 * Grava a nota, seus itens e atualiza o catálogo de insumos.
 *
 * `unitId` vem da tela quando o CNPJ do destinatário ainda não é conhecido.
 * Nesse caso o CNPJ é gravado na unidade -- é assim que o sistema aprende: a
 * segunda nota daquela loja entra sozinha. Hoje 14 das 16 lojas estão sem
 * CNPJ no cadastro, então sem isso ninguém importaria nada sem escolher a loja
 * toda vez.
 */
export async function importarNF(
  holdingId: string,
  nf: NFParsed,
  unitId: string | null,
  userId: string | null,
  xml: string,
): Promise<ImportarResultado> {
  const admin = createAdminClient()

  const { data: jaExiste } = await admin
    .from("nf_documentos")
    .select("id, numero")
    .eq("chave", nf.chave)
    .maybeSingle()
  if (jaExiste) {
    throw new Error(
      `A nota ${nf.numero ?? ""} já foi importada. A chave de acesso é única — reimportar não muda nada.`,
    )
  }

  // Ensina o CNPJ à unidade escolhida. `is null` na condição: nunca sobrescreve
  // um CNPJ que já existe -- se estiver errado, quem corrige é o cadastro, não
  // uma importação de nota.
  let cnpjAprendido = false
  if (unitId && nf.destCnpj) {
    const { data: upd } = await admin
      .from("units")
      .update({ cnpj: nf.destCnpj })
      .eq("id", unitId)
      .is("cnpj", null)
      .select("id")
    cnpjAprendido = (upd ?? []).length > 0
  }

  const regime: RegimeFiscal = await regimeDaUnidade(unitId)

  const { data: doc, error: errDoc } = await admin
    .from("nf_documentos")
    .insert({
      holding_id: holdingId,
      unit_id: unitId,
      chave: nf.chave,
      numero: nf.numero,
      serie: nf.serie,
      emissao: nf.emissao,
      emit_cnpj: nf.emitCnpj,
      emit_nome: nf.emitNome,
      dest_cnpj: nf.destCnpj,
      dest_nome: nf.destNome,
      valor_total: nf.valorTotal,
      valor_produtos: nf.valorProdutos,
      valor_desconto: nf.valorDesconto,
      valor_frete: nf.valorFrete,
      valor_icms: nf.valorIcms,
      valor_pis: nf.valorPis,
      valor_cofins: nf.valorCofins,
      valor_ipi: nf.valorIpi,
      valor_st: nf.valorSt,
      xml,
      importado_por: userId,
    })
    .select("id")
    .single()
  if (errDoc || !doc) throw new Error(`salvar a nota — ${errDoc?.message}`)

  // Catálogo: um insumo por cProd. Traz os existentes de uma vez -- 22 itens
  // viravam 22 idas ao banco.
  const codigos = [...new Set(nf.itens.map((i) => i.codigo).filter(Boolean))]
  const { data: existentes } = await admin
    .from("insumos")
    .select("id, codigo, fator_conversao")
    .eq("holding_id", holdingId)
    .in("codigo", codigos.length ? codigos : ["__nenhum__"])

  const porCodigo = new Map<
    string,
    { id: string; fator: number | null }
  >()
  for (const e of existentes ?? [])
    porCodigo.set(e.codigo as string, {
      id: e.id as string,
      fator: e.fator_conversao === null ? null : Number(e.fator_conversao),
    })

  let novos = 0
  let atualizados = 0
  const agora = new Date().toISOString()

  for (const item of nf.itens) {
    if (!item.codigo) continue
    const custo = custoDoItem(item, regime)
    // Custo por unidade de COMPRA. É o que dá pra saber sem fator de conversão,
    // e já serve: "a caixa de potes subiu de R$ 590 pra R$ 614".
    const custoCompra = item.quantidade > 0 ? custo / item.quantidade : null
    const achado = porCodigo.get(item.codigo)

    if (achado) {
      const custoUso =
        custoCompra !== null && achado.fator ? custoCompra / achado.fator : null
      await admin
        .from("insumos")
        .update({
          nome: item.descricao,
          ncm: item.ncm,
          unidade_compra: item.unidade,
          custo_compra: custoCompra,
          custo_atual: custoUso,
          custo_em: agora,
          updated_at: agora,
        })
        .eq("id", achado.id)
      atualizados++
    } else {
      const { data: novo } = await admin
        .from("insumos")
        .insert({
          holding_id: holdingId,
          codigo: item.codigo,
          nome: item.descricao,
          ncm: item.ncm,
          unidade_compra: item.unidade,
          custo_compra: custoCompra,
          custo_em: agora,
        })
        .select("id")
        .single()
      if (novo) {
        porCodigo.set(item.codigo, { id: novo.id as string, fator: null })
        novos++
      }
    }
  }

  const { error: errItens } = await admin.from("nf_itens").insert(
    nf.itens.map((i) => ({
      nf_id: doc.id,
      holding_id: holdingId,
      insumo_id: porCodigo.get(i.codigo)?.id ?? null,
      n_item: i.nItem,
      codigo: i.codigo,
      descricao: i.descricao,
      ncm: i.ncm,
      cfop: i.cfop,
      unidade: i.unidade,
      quantidade: i.quantidade,
      valor_unitario: i.valorUnitario,
      valor_total: i.valorTotal,
      v_icms: i.vIcms,
      v_pis: i.vPis,
      v_cofins: i.vCofins,
      v_ipi: i.vIpi,
    })),
  )
  if (errItens) throw new Error(`salvar os itens — ${errItens.message}`)

  let loja: string | null = null
  if (unitId) {
    const { data: u } = await admin
      .from("units")
      .select("name")
      .eq("id", unitId)
      .maybeSingle()
    loja = (u?.name as string) ?? null
  }

  return {
    nfId: doc.id as string,
    loja,
    itens: nf.itens.length,
    insumosNovos: novos,
    insumosAtualizados: atualizados,
    cnpjAprendido,
    avisos: nf.avisos,
  }
}

/** Sem loja definida, assume Simples — o lado seguro de errar num custo. */
async function regimeDaUnidade(unitId: string | null): Promise<RegimeFiscal> {
  if (!unitId) return "simples"
  const { data } = await createAdminClient()
    .from("units")
    .select("regime_fiscal")
    .eq("id", unitId)
    .maybeSingle()
  return (data?.regime_fiscal as RegimeFiscal) ?? "simples"
}

/**
 * Fator de conversão do insumo — e o custo por unidade de uso que sai dele.
 *
 * Recalcula na hora em vez de esperar a próxima nota: quem acabou de dizer que
 * a caixa tem 480 potes quer ver R$ 1,28 aparecer, não descobrir na semana que
 * vem.
 */
export async function definirFator(
  holdingId: string,
  insumoId: string,
  unidadeUso: string | null,
  fator: number | null,
): Promise<void> {
  const admin = createAdminClient()
  const { data: atual } = await admin
    .from("insumos")
    .select("custo_compra")
    .eq("id", insumoId)
    .eq("holding_id", holdingId)
    .maybeSingle()
  if (!atual) throw new Error("Insumo não encontrado.")

  const custoCompra =
    atual.custo_compra === null ? null : Number(atual.custo_compra)
  const custoUso =
    custoCompra !== null && fator && fator > 0 ? custoCompra / fator : null

  const { error } = await admin
    .from("insumos")
    .update({
      unidade_uso: unidadeUso,
      fator_conversao: fator,
      custo_atual: custoUso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", insumoId)
    .eq("holding_id", holdingId)
  if (error) throw new Error(`salvar o fator — ${error.message}`)
}
