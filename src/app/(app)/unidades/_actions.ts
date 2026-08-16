"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireModulePermission, requireUnitWrite } from "@/lib/auth/guards"
import { isSuperadmin } from "@/lib/auth/permissions"
import { getDefaultBrand } from "@/lib/data/units"
import { createAdminClient } from "@/lib/supabase/admin"
import { sincronizarValorAssinatura } from "@/lib/data/assinatura-sync"


/**
 * Cidade com a grafia oficial do IBGE (ou como veio, se não reconhecer).
 *
 * POR QUE EXISTE: a consulta de CNPJ na Receita devolve "SAO PAULO", e quem
 * digita no formulário escreve "São Paulo". As duas iam parar na mesma coluna,
 * e o seletor de cidade da tela de Unidades listava a mesma cidade duas vezes
 * — filtrar por uma escondia as lojas da outra. Em 16/08/26 eram 45 "cidades"
 * distintas pra 101 lojas; depois de padronizar, 40 de verdade.
 *
 * Normaliza NA GRAVAÇÃO e não na exibição de propósito: assim o agrupamento,
 * o filtro e qualquer relatório futuro já nascem certos, em vez de cada tela
 * ter que lembrar de arrumar o texto.
 *
 * Nunca apaga: cidade fora da lista (bairro cadastrado como cidade, UF errada)
 * fica exatamente como a pessoa escreveu.
 */
async function cidadePadronizada(
  supabase: ReturnType<typeof createAdminClient>,
  city: string,
  state: string,
): Promise<string> {
  if (!city) return city
  const { data, error } = await supabase.rpc("normalizar_cidade", {
    p_cidade: city,
    p_uf: state,
  })
  // Erro aqui não pode impedir o cadastro de salvar: grafia é acabamento,
  // não requisito.
  if (error) {
    console.error("normalizar_cidade:", error.message)
    return city
  }
  return (data as string | null) ?? city
}
import { validateImageUpload } from "@/lib/upload/image"

export type CreateUnitState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

// Inclui o canal próprio: o form de unidade pergunta "por onde essa loja
// vende?", e a resposta pode ser Cardápio Web. Quem cuida de dinheiro de
// marketplace (DRE, importação) filtra com ehMarketplace().
const ALL_PLATFORMS = ["ifood", "99food", "keeta", "cardapioweb"] as const
type PlatformId = (typeof ALL_PLATFORMS)[number]

function cleanCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, "")
}

/** "YYYY-MM-DD" válido → mantém; vazio/ inválido → null. */
function dateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function isValidCnpj(cnpj: string): boolean {
  const c = cleanCnpj(cnpj)
  if (c.length !== 14) return false
  if (/^(\d)\1+$/.test(c)) return false
  const calc = (slice: string, weights: number[]) => {
    const sum = slice
      .split("")
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calc(c.slice(0, 12), w1)
  const d2 = calc(c.slice(0, 12) + d1, w2)
  return c[12] === String(d1) && c[13] === String(d2)
}

/**
 * Gera o próximo código sequencial baseado nos códigos existentes
 * que sejam numéricos puros. Códigos não-numéricos (ex.: "TST", "JK")
 * são ignorados pra não conflitar.
 */
async function generateNextCode(
  supabase: ReturnType<typeof createAdminClient>,
  brandId: string,
): Promise<string> {
  // Escopado à HOLDING, não à marca. O banco só exige unique(brand_id, code),
  // mas quem usa o sistema vê a holding inteira numa lista só — e a rota é
  // /unidades/<code>, resolvida por código. Duas lojas de marcas diferentes
  // com o mesmo número deixavam uma delas inalcançável pela navegação.
  // Numerar por holding faz o número ser único no escopo em que ele é usado.
  const { data: marca } = await supabase
    .from("brands")
    .select("holding_id")
    .eq("id", brandId)
    .single()

  const { data: irmas } = await supabase
    .from("brands")
    .select("id")
    .eq("holding_id", marca?.holding_id ?? "")

  // Se a marca não resolveu a holding, cai de volta pro escopo da marca —
  // pior gerar um número repetido do que travar o cadastro.
  const brandIds = (irmas ?? []).map((b) => b.id as string)
  const { data } = await supabase
    .from("units")
    .select("code")
    .in("brand_id", brandIds.length > 0 ? brandIds : [brandId])
  let max = 0
  for (const row of data ?? []) {
    const n = parseInt(row.code, 10)
    if (!isNaN(n) && /^\d+$/.test(row.code)) {
      max = Math.max(max, n)
    }
  }
  return String(max + 1).padStart(2, "0")
}

/**
 * Regras extras de cadastro pro CLIENTE SaaS (pedido do Marcus): CNPJ,
 * inauguração e ao menos uma plataforma são OBRIGATÓRIOS — é o que permite
 * o "Conectar iFood via API" reusar o CNPJ do cadastro sem pedir de novo, e
 * a Cobertura funcionar desde o primeiro mês.
 *
 * O superadmin (Marcus) fica isento: as lojas da Cozina têm casos legados
 * (CNPJ em formalização etc.) e ele sabe o que está fazendo.
 */
async function aplicarCadastroExigente(
  fieldErrors: Record<string, string>,
  dados: {
    cnpjRaw: string
    dataInauguracao: string | null
    platformsCount: number
    /** Campos do perfil — quando ausente, só as regras antigas valem. */
    perfil?: Record<string, string | null> | null
  },
): Promise<void> {
  // ⚠️ O CNPJ é cobrado ANTES da isenção do superadmin, de propósito.
  //
  // Num SaaS o cadastro é o ativo: sem CNPJ não dá pra casar a loja com o
  // extrato da plataforma sozinho (foi o que travou a Edmai's e a Forno Itália
  // em 30/07), nem comparar loja com loja. A isenção existia pra caso legado —
  // e o caso legado virou 18 unidades sem CNPJ, 12 delas da própria Cozina.
  if (!dados.cnpjRaw) fieldErrors.cnpj = "CNPJ obrigatório"

  // ⚠️ A partir de 09/08/26 a exigência vale pra TODO MUNDO, inclusive o
  // super-admin (decisão do Marcus). A isenção existia pra caso legado, e o
  // caso legado virou a regra: das 76 lojas ativas, 74 sem e-mail do
  // responsável, 70 sem "quem entrega", 68 sem modelo da unidade.
  //
  // Trava só a EDIÇÃO — nada impede o dado das plataformas de continuar
  // entrando. Loja incompleta segue sincronizando; o que não dá mais é
  // salvar uma alteração deixando o cadastro pela metade.
  if (!dados.dataInauguracao)
    fieldErrors.data_inauguracao = "Inauguração obrigatória"
  if (dados.platformsCount === 0)
    fieldErrors.platforms = "Selecione ao menos uma plataforma"

  const perfil = dados.perfil
  if (!perfil) return
  const exigir: [keyof typeof perfil, string, string][] = [
    ["razao_social", "razao_social", "Razão social obrigatória"],
    ["tipo_cozinha", "tipo_cozinha", "Tipo de cozinha obrigatório"],
    ["logradouro", "logradouro", "Endereço obrigatório"],
    ["numero", "numero", "Número obrigatório"],
    ["bairro", "bairro", "Bairro obrigatório"],
    ["cep", "cep", "CEP obrigatório"],
    ["telefone", "telefone", "Telefone obrigatório"],
    ["responsavel_nome", "responsavel_nome", "Responsável obrigatório"],
    // E-MAIL DO RESPONSÁVEL É OPCIONAL de propósito, junto do complemento.
    // Muita loja de rede é tocada por um gerente que não tem e-mail próprio, e
    // o cadastro travava inteiro por causa disso — a pessoa preenchia 13
    // campos, esbarrava no 14º e desistia de salvar o resto. Quando existe,
    // ele é útil (aviso de conexão, resumo semanal); quando não existe, o
    // obrigatório só produzia "nao@tem.com".
    ["tipo_operacao", "tipo_operacao", "Modelo da unidade obrigatório"],
    ["regime_fiscal", "regime_fiscal", "Regime fiscal obrigatório"],
    ["tipo_entrega", "tipo_entrega", "Informe quem entrega"],
  ]
  for (const [chave, campo, msg] of exigir) {
    if (!perfil[chave]) fieldErrors[campo] = msg
  }

  // COMPLEMENTO fica de fora de propósito: muito endereço não tem, e campo
  // obrigatório sem valor real vira "-" ou "N/A" — pior que vazio, porque
  // parece preenchido e ninguém volta pra corrigir.
}

export async function createUnit(
  _prevState: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  const active = formData.get("active") === "on"
  const dataInauguracao = dateOrNull(formData.get("data_inauguracao"))
  const dataEncerramento = dateOrNull(formData.get("data_encerramento"))

  // Perfil + o que veio da Receita. Tudo opcional: o CNPJ é que é obrigatório,
  // e a consulta é conveniência — se a BrasilAPI estiver fora, o cadastro
  // continua possível na mão.
  const txt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim()
    return v || null
  }
  const perfil = {
    tipo_cozinha: txt("tipo_cozinha"),
    tipo_operacao: txt("tipo_operacao"),
    regime_fiscal: txt("regime_fiscal") ?? "simples",
    tipo_entrega: txt("tipo_entrega"),
    razao_social: txt("razao_social"),
    nome_fantasia: txt("nome_fantasia"),
    cnae_codigo: txt("cnae_codigo"),
    cnae_descricao: txt("cnae_descricao"),
    data_abertura: dateOrNull(formData.get("data_abertura")),
    situacao_cadastral: txt("situacao_cadastral"),
    logradouro: txt("logradouro"),
    numero: txt("numero"),
    complemento: txt("complemento"),
    bairro: txt("bairro"),
    cep: txt("cep"),
    telefone: txt("telefone"),
    responsavel_nome: txt("responsavel_nome"),
    responsavel_email: txt("responsavel_email"),
    receita_consultada_em: txt("razao_social") ? new Date().toISOString() : null,
  }

  // Plataformas vêm como múltiplos checkboxes com nome="platforms"
  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = "Nome obrigatório"
  if (!city) fieldErrors.city = "Cidade obrigatória"
  if (!state || state.length !== 2)
    fieldErrors.state = "UF deve ter 2 letras"
  if (cnpjRaw && !isValidCnpj(cnpjRaw)) fieldErrors.cnpj = "CNPJ inválido"
  await aplicarCadastroExigente(fieldErrors, {
    cnpjRaw,
    dataInauguracao,
    platformsCount: platforms.length,
    perfil,
  })

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    await requireModulePermission("unidades", "edit")
    const brand = await getDefaultBrand()
    const supabase = createAdminClient()
    const code = await generateNextCode(supabase, brand.id)

    const { data: unit, error } = await supabase
      .from("units")
      .insert({
        brand_id: brand.id,
        code,
        name,
        city: await cidadePadronizada(supabase, city, state),
        state,
        cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
        active,
        data_inauguracao: dataInauguracao,
        data_encerramento: dataEncerramento,
        ...perfil,
      })
      .select("id")
      .single()

    if (error) {
      return { ok: false, message: error.message }
    }

    // Insere as plataformas selecionadas
    if (platforms.length > 0 && unit) {
      const { error: platErr } = await supabase.from("unit_platforms").insert(
        platforms.map((p) => ({ unit_id: unit.id, platform: p, active: true })),
      )
      if (platErr) {
        // Não impede o cadastro da unidade, só loga
        console.error("Erro ao salvar plataformas:", platErr.message)
      }
    }

    if (unit?.id) await ressincronizarCobranca(unit.id)

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/**
 * Loja criada, apagada ou (des)ativada muda a quantidade cobrada — e a
 * mensalidade é "primeira loja + adicionais". Sem isto a assinatura recorrente
 * segue no valor do dia da adesão: cliente que dobra de tamanho continua
 * pagando pelo tamanho antigo, e não há erro em lugar nenhum pra denunciar.
 *
 * Best-effort de propósito: nunca impede o cadastro da loja de salvar. O cron
 * diário reconcilia o que não passar aqui.
 */
async function ressincronizarCobranca(unitId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: u } = await admin
      .from("units")
      .select("brand_id")
      .eq("id", unitId)
      .maybeSingle()
    const brandId = (u as { brand_id?: string | null } | null)?.brand_id
    if (!brandId) return
    const { data: b } = await admin
      .from("brands")
      .select("holding_id")
      .eq("id", brandId)
      .maybeSingle()
    const holdingId = (b as { holding_id?: string | null } | null)?.holding_id
    if (holdingId) await sincronizarValorAssinatura(holdingId)
  } catch {
    /* cobrança nunca derruba cadastro de loja */
  }
}

export async function deleteUnit(unitId: string): Promise<CreateUnitState> {
  if (!unitId) return { ok: false, message: "ID da unidade ausente." }
  try {
    await requireModulePermission("unidades", "delete")
    await requireUnitWrite(unitId) // anti cross-tenant: só apaga loja do próprio escopo
    const supabase = createAdminClient()
    // Descobre a holding ANTES do delete — depois a unidade não existe mais.
    const { data: uAntes } = await supabase
      .from("units")
      .select("brand_id")
      .eq("id", unitId)
      .maybeSingle()
    const { error } = await supabase.from("units").delete().eq("id", unitId)
    if (error) return { ok: false, message: error.message }
    const brandId = (uAntes as { brand_id?: string | null } | null)?.brand_id
    if (brandId) {
      const { data: b } = await supabase
        .from("brands")
        .select("holding_id")
        .eq("id", brandId)
        .maybeSingle()
      const hId = (b as { holding_id?: string | null } | null)?.holding_id
      if (hId) await sincronizarValorAssinatura(hId)
    }
    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/** Sobe o logo de UMA loja (white-label por unidade) → units.logo_url. */
export async function saveUnitLogo(formData: FormData): Promise<CreateUnitState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  if (!unitId) return { ok: false, message: "ID da unidade ausente." }
  const img = await validateImageUpload(formData.get("logo"))
  if (!img.ok) return { ok: false, message: img.message }
  try {
    await requireModulePermission("unidades", "edit")
    await requireUnitWrite(unitId) // anti cross-tenant: só a própria loja
    const supabase = createAdminClient()
    const path = `units/${unitId}.${img.ext}`
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, img.bytes, { upsert: true, contentType: img.contentType })
    if (upErr) return { ok: false, message: `Falha no upload: ${upErr.message}` }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}` // cache-bust pro CDN
    const { error } = await supabase
      .from("units")
      .update({ logo_url: url })
      .eq("id", unitId)
    if (error) return { ok: false, message: error.message }
    revalidateTag("units", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/** Remove o logo da loja (volta pro logo da empresa / inicial). */
export async function removeUnitLogo(unitId: string): Promise<CreateUnitState> {
  if (!unitId) return { ok: false, message: "ID da unidade ausente." }
  try {
    await requireModulePermission("unidades", "edit")
    await requireUnitWrite(unitId)
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("units")
      .update({ logo_url: null })
      .eq("id", unitId)
    if (error) return { ok: false, message: error.message }
    revalidateTag("units", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function updateUnit(
  _prevState: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  const active = formData.get("active") === "on"
  const dataInauguracao = dateOrNull(formData.get("data_inauguracao"))
  const dataEncerramento = dateOrNull(formData.get("data_encerramento"))

  // Perfil + o que veio da Receita. Tudo opcional: o CNPJ é que é obrigatório,
  // e a consulta é conveniência — se a BrasilAPI estiver fora, o cadastro
  // continua possível na mão.
  const txt = (k: string) => {
    const v = String(formData.get(k) ?? "").trim()
    return v || null
  }
  const perfil = {
    tipo_cozinha: txt("tipo_cozinha"),
    tipo_operacao: txt("tipo_operacao"),
    regime_fiscal: txt("regime_fiscal") ?? "simples",
    tipo_entrega: txt("tipo_entrega"),
    razao_social: txt("razao_social"),
    nome_fantasia: txt("nome_fantasia"),
    cnae_codigo: txt("cnae_codigo"),
    cnae_descricao: txt("cnae_descricao"),
    data_abertura: dateOrNull(formData.get("data_abertura")),
    situacao_cadastral: txt("situacao_cadastral"),
    logradouro: txt("logradouro"),
    numero: txt("numero"),
    complemento: txt("complemento"),
    bairro: txt("bairro"),
    cep: txt("cep"),
    telefone: txt("telefone"),
    responsavel_nome: txt("responsavel_nome"),
    responsavel_email: txt("responsavel_email"),
    receita_consultada_em: txt("razao_social") ? new Date().toISOString() : null,
  }

  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )

  // IDs externos por plataforma (ifoodStoreId, _99foodStoreId, keetaStoreId)
  const ifoodStoreId =
    String(formData.get("ifoodStoreId") ?? "").trim() || null
  const _99foodStoreId =
    String(formData.get("_99foodStoreId") ?? "").trim() || null
  const keetaStoreId =
    String(formData.get("keetaStoreId") ?? "").trim() || null
  const inaugByPlatform: Partial<Record<PlatformId, string | null>> = {
    ifood: dateOrNull(formData.get("ifoodInauguracao")),
    "99food": dateOrNull(formData.get("_99foodInauguracao")),
    keeta: dateOrNull(formData.get("keetaInauguracao")),
  }

  if (!unitId) {
    return { ok: false, message: "ID da unidade ausente." }
  }

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = "Nome obrigatório"
  if (!city) fieldErrors.city = "Cidade obrigatória"
  if (!state || state.length !== 2)
    fieldErrors.state = "UF deve ter 2 letras"
  if (cnpjRaw && !isValidCnpj(cnpjRaw)) fieldErrors.cnpj = "CNPJ inválido"
  await aplicarCadastroExigente(fieldErrors, {
    cnpjRaw,
    dataInauguracao,
    platformsCount: platforms.length,
    perfil,
  })

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    await requireModulePermission("unidades", "edit")
    await requireUnitWrite(unitId) // anti cross-tenant: só edita loja do próprio escopo
    const supabase = createAdminClient()

    const { error: updErr } = await supabase
      .from("units")
      .update({
        name,
        city: await cidadePadronizada(supabase, city, state),
        state,
        cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
        active,
        data_inauguracao: dataInauguracao,
        data_encerramento: dataEncerramento,
        ...perfil,
      })
      .eq("id", unitId)

    if (updErr) {
      return { ok: false, message: updErr.message }
    }

    // Sync de plataformas:
    // - Mantém external_store_id já existente (a menos que o form sobrescreva)
    // - Adiciona linhas pras plataformas marcadas
    // - Remove linhas das plataformas desmarcadas
    const externalIdByPlatform: Partial<Record<PlatformId, string | null>> = {
      ifood: ifoodStoreId,
      "99food": _99foodStoreId,
      keeta: keetaStoreId,
    }

    // Pega os atuais pra PRESERVAR o que o formulário não conhece.
    //
    // ⚠️ Este bloco é delete+insert, então tudo que não for copiado aqui é
    // perdido em silêncio a cada edição da unidade. Foi assim que 5 lojas da
    // DG Foods perderam o vínculo com o iFood em 27/jul: conectaram de manhã,
    // alguém editou o cadastro à noite, e o api_store_id sumiu sem aviso — a
    // loja continuava "ativa" na fila e parava de sincronizar.
    //
    // Ao acrescentar coluna nova em unit_platforms, ou ela entra aqui, ou
    // vira o próximo dado que evapora numa edição de cadastro.
    const { data: existingRows } = await supabase
      .from("unit_platforms")
      .select(
        "platform, external_store_id, api_store_id, fin_enabled_at, review_enabled_at, data_encerramento",
      )
      .eq("unit_id", unitId)
    type LinhaExistente = {
      external_store_id: string | null
      api_store_id: string | null
      fin_enabled_at: string | null
      review_enabled_at: string | null
      data_encerramento: string | null
    }
    const existingMap = new Map<PlatformId, LinhaExistente>(
      (existingRows ?? []).map((r) => [
        r.platform as PlatformId,
        {
          external_store_id: r.external_store_id as string | null,
          api_store_id: r.api_store_id as string | null,
          fin_enabled_at: r.fin_enabled_at as string | null,
          review_enabled_at: r.review_enabled_at as string | null,
          data_encerramento: r.data_encerramento as string | null,
        },
      ]),
    )

    await supabase.from("unit_platforms").delete().eq("unit_id", unitId)
    if (platforms.length > 0) {
      await supabase.from("unit_platforms").insert(
        platforms.map((p) => ({
          unit_id: unitId,
          platform: p,
          active: true,
          // Preferência: o que veio no form > o que já tinha
          external_store_id:
            externalIdByPlatform[p] !== undefined &&
            externalIdByPlatform[p] !== null
              ? externalIdByPlatform[p]
              : (existingMap.get(p)?.external_store_id ?? null),
          // Inauguração por plataforma (o form vem pré-preenchido).
          data_inauguracao: inaugByPlatform[p] ?? null,
          // Campos de INTEGRAÇÃO: o formulário não os edita, então só podem
          // ser copiados do que já existia.
          api_store_id: existingMap.get(p)?.api_store_id ?? null,
          fin_enabled_at: existingMap.get(p)?.fin_enabled_at ?? null,
          review_enabled_at: existingMap.get(p)?.review_enabled_at ?? null,
          data_encerramento: existingMap.get(p)?.data_encerramento ?? null,
        })),
      )
    }

    // Ativar/desativar loja muda a quantidade cobrada.
    await ressincronizarCobranca(unitId)

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")
    revalidatePath("/importacao")
    revalidatePath(`/unidades/[codigo]`, "page")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
