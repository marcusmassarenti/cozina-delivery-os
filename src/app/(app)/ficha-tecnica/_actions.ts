"use server"

/**
 * Salvar o custo de um item vendido.
 *
 * Uma ação por linha, sem botão de "salvar tudo": quem preenche cem linhas não
 * pode perder o trabalho porque fechou a aba antes de apertar salvar. Cada
 * campo grava sozinho ao sair dele.
 */
import { revalidatePath } from "next/cache"

import { getAuthUser, getCurrentHoldingId } from "@/lib/auth/permissions"
import { requireUnitWrite } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { PLATAFORMAS_CUSTO } from "@/lib/data/custo-itens"

export type EstadoCusto = { ok: boolean; erro?: string }

/**
 * Pode escrever NESTA loja?
 *
 * ⚠️ A permissão é por LOJA, não por cargo. Antes eram duas checagens em
 * sequência — `requireAdmin()` e depois "a loja está no meu escopo?" — e a
 * primeira barrava franqueado e gerente de mexerem na própria loja, que é
 * justamente quem convive com o custo dela.
 *
 * `requireUnitWrite` é o guard desenhado pra isso (o comentário dele cita
 * "custos" com todas as letras): resolve escopo, cross-tenant e ainda recusa
 * loja emprestada em modo leitura. O unitId chega do navegador, então essa
 * checagem é o que impede gravar na loja do vizinho mandando o uuid na mão.
 */
async function podeEscrever(unitId: string): Promise<boolean> {
  try {
    await requireUnitWrite(unitId)
    return true
  } catch {
    return false
  }
}

export async function salvarCustoItem(input: {
  unitId: string
  platform: string
  nomeItem: string
  /** Null apaga a linha — é como se volta pra "não preenchido". */
  custo: number | null
}): Promise<EstadoCusto> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }
  if (!PLATAFORMAS_CUSTO.includes(input.platform as never)) {
    return { ok: false, erro: "Plataforma inválida." }
  }
  const nome = input.nomeItem.trim()
  if (!nome) return { ok: false, erro: "Item sem nome." }

  const admin = createAdminClient()

  // Campo apagado = custo volta a NULL. NÃO apaga a linha: ela pode carregar a
  // categoria, e limpar o custo não é pedido pra desclassificar o item.
  if (input.custo === null) {
    const { error } = await admin
      .from("item_custos")
      .update({ custo: null, updated_at: new Date().toISOString() })
      .eq("unit_id", input.unitId)
      .eq("platform", input.platform)
      .eq("nome_item", nome)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/ficha-tecnica")
    return { ok: true }
  }

  if (!Number.isFinite(input.custo) || input.custo < 0) {
    return { ok: false, erro: "Custo inválido." }
  }

  const user = await getAuthUser()
  const { error } = await admin.from("item_custos").upsert(
    {
      unit_id: input.unitId,
      platform: input.platform,
      nome_item: nome,
      custo: input.custo,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "unit_id,platform,nome_item" },
  )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/**
 * Salvar o PREÇO DE VENDA (de tabela) de um item.
 *
 * Gêmea de `salvarCustoItem`, e separada de propósito: preço e custo são
 * preenchidos em momentos diferentes — o preço a operação sabe de cor, o custo
 * depende da ficha — e um campo não pode ficar esperando o outro pra gravar.
 *
 * A linha é a MESMA (upsert por loja+plataforma+nome), então pode existir preço
 * sem custo e vice-versa: os dois nascem NULL e cada um vira número quando
 * alguém digita.
 */
export async function salvarPrecoVendaItem(input: {
  unitId: string
  platform: string
  nomeItem: string
  /** Null volta pra "não preenchido" — não apaga a linha. */
  precoVenda: number | null
}): Promise<EstadoCusto> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }
  if (!PLATAFORMAS_CUSTO.includes(input.platform as never)) {
    return { ok: false, erro: "Plataforma inválida." }
  }
  const nome = input.nomeItem.trim()
  if (!nome) return { ok: false, erro: "Item sem nome." }

  const admin = createAdminClient()

  if (input.precoVenda === null) {
    const { error } = await admin
      .from("item_custos")
      .update({ preco_venda: null, updated_at: new Date().toISOString() })
      .eq("unit_id", input.unitId)
      .eq("platform", input.platform)
      .eq("nome_item", nome)
    if (error) return { ok: false, erro: error.message }
    revalidatePath("/ficha-tecnica")
    return { ok: true }
  }

  if (!Number.isFinite(input.precoVenda) || input.precoVenda < 0) {
    return { ok: false, erro: "Preço inválido." }
  }

  const user = await getAuthUser()
  const { error } = await admin.from("item_custos").upsert(
    {
      unit_id: input.unitId,
      platform: input.platform,
      nome_item: nome,
      preco_venda: input.precoVenda,
      // NÃO manda `custo`: na inserção ele fica NULL (= não preenchido).
      // Mandar zero faria o item nascer "com custo" e entrar na cobertura com
      // margem de 100% — o bug que a migration 0215 consertou.
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "unit_id,platform,nome_item" },
  )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/**
 * Copia o custo de uma linha para as outras que parecem ser a mesma comida.
 *
 * ⚠️ NÃO É AUTOMÁTICO, e é por isso que ele existe como botão. Medimos que
 * casar nome entre plataformas acerta pouco (127 nomes numa loja viram 115
 * depois de normalizar tudo): um vínculo automático erraria em silêncio. Aqui a
 * pessoa vê a lista do que vai receber o custo e confirma — a mesma sobrecoxa
 * escrita de três jeitos resolve num clique, e o erro, se houver, é visível.
 */
export async function aplicarCustoEmLote(input: {
  unitId: string
  custo: number
  alvos: { platform: string; nomeItem: string }[]
}): Promise<EstadoCusto & { gravados?: number }> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }
  if (!Number.isFinite(input.custo) || input.custo < 0) {
    return { ok: false, erro: "Custo inválido." }
  }

  const validos = input.alvos.filter(
    (a) =>
      PLATAFORMAS_CUSTO.includes(a.platform as never) && a.nomeItem.trim() !== "",
  )
  if (validos.length === 0) return { ok: true, gravados: 0 }

  const user = await getAuthUser()
  const agora = new Date().toISOString()
  const { error } = await createAdminClient()
    .from("item_custos")
    .upsert(
      validos.map((a) => ({
        unit_id: input.unitId,
        platform: a.platform,
        nome_item: a.nomeItem.trim(),
        custo: input.custo,
        updated_by: user?.id ?? null,
        updated_at: agora,
      })),
      { onConflict: "unit_id,platform,nome_item" },
    )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true, gravados: validos.length }
}

/**
 * Categoria do item.
 *
 * Grava na MESMA linha do custo (upsert por loja+plataforma+nome), então pode
 * existir categoria sem custo: é comum a pessoa classificar o cardápio inteiro
 * primeiro e só depois sentar pra preencher preço de compra.
 */
export async function salvarCategoriaItem(input: {
  unitId: string
  platform: string
  nomeItem: string
  categoria: string
}): Promise<EstadoCusto> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }
  if (!PLATAFORMAS_CUSTO.includes(input.platform as never)) {
    return { ok: false, erro: "Plataforma inválida." }
  }

  const nome = input.nomeItem.trim()
  const cat = input.categoria.trim().slice(0, 60)
  if (!nome) return { ok: false, erro: "Item sem nome." }

  const user = await getAuthUser()
  const { error } = await createAdminClient()
    .from("item_custos")
    .upsert(
      {
        unit_id: input.unitId,
        platform: input.platform,
        nome_item: nome,
        // Campo em branco volta a "sem categoria" em vez de gravar "".
        categoria: cat === "" ? null : cat,
        // ⚠️ NÃO manda `custo`. Na inserção ele fica NULL (= não preenchido) e
        // no conflito o que já estava é preservado. Mandar 0 aqui faria
        // classificar um item parecer que ele custa zero.
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,platform,nome_item" },
    )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/**
 * Importa custos e categorias da planilha.
 *
 * ⚠️ SÓ ACEITA ITEM QUE A LOJA REALMENTE VENDEU. A planilha é editada fora do
 * sistema e volta com o que quer que tenham digitado; sem essa conferência, um
 * nome alterado viraria uma linha de custo que nunca casa com venda nenhuma —
 * invisível na tela e somando errado em lugar nenhum. O que não bate volta
 * contado como `ignorados`, pra pessoa saber que sobrou coisa.
 */
export async function importarCustosPlanilha(input: {
  unitId: string
  linhas: {
    platform: string
    nomeItem: string
    custo: number | null
    categoria: string | null
    precoVenda?: number | null
  }[]
  /**
   * A planilha TINHA a coluna "Preço de venda (R$)"?
   *
   * ⚠️ Não é firula. Planilhas exportadas antes da coluna existir (0217) não a
   * trazem, e o upsert é uma escrita de linha inteira: sem esta trava, importar
   * um arquivo antigo mandaria `preco_venda: null` e apagaria calado o preço de
   * todos os itens. Ausência de coluna significa "não mexe", nunca "limpa".
   */
  incluiPrecoVenda?: boolean
}): Promise<EstadoCusto & { gravados?: number; ignorados?: number }> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }

  const admin = createAdminClient()

  // O conjunto do que existe vem da mesma RPC que desenha a tela. Usar outra
  // fonte aqui abriria espaço pros dois discordarem sobre o que é "um item".
  const hoje = new Date()
  const { data: vendas } = await admin.rpc("itens_vendidos_mes", {
    p_unit_id: input.unitId,
    p_year: hoje.getFullYear(),
    p_month: hoje.getMonth() + 1,
  })
  const existentes = new Set(
    ((vendas ?? []) as { platform: string; nome_item: string }[]).map(
      (v) => `${v.platform}|${v.nome_item}`,
    ),
  )

  // Mês corrente pode estar vazio (loja que ainda não vendeu hoje). Aí vale o
  // que já tem custo gravado — senão a importação recusaria tudo.
  const { data: jaTem } = await admin
    .from("item_custos")
    .select("platform, nome_item")
    .eq("unit_id", input.unitId)
  for (const c of (jaTem ?? []) as { platform: string; nome_item: string }[]) {
    existentes.add(`${c.platform}|${c.nome_item}`)
  }

  const user = await getAuthUser()
  const agora = new Date().toISOString()
  const validas = input.linhas.filter(
    (l) =>
      PLATAFORMAS_CUSTO.includes(l.platform as never) &&
      existentes.has(`${l.platform}|${l.nomeItem}`) &&
      // Linha vazia nas TRÊS colunas editáveis não vira gravação. Sem incluir
      // o preço aqui, uma planilha com só os preços preenchidos seria
      // descartada inteira e voltaria como "ignorados".
      (l.custo !== null ||
        l.categoria !== null ||
        (l.precoVenda ?? null) !== null),
  )
  const ignorados = input.linhas.length - validas.length
  if (validas.length === 0) return { ok: true, gravados: 0, ignorados }

  const { error } = await admin.from("item_custos").upsert(
    validas.map((l) => ({
      unit_id: input.unitId,
      platform: l.platform,
      nome_item: l.nomeItem,
      custo: l.custo,
      categoria: l.categoria,
      // Só entra na escrita se a planilha realmente tinha a coluna.
      ...(input.incluiPrecoVenda ? { preco_venda: l.precoVenda ?? null } : {}),
      updated_by: user?.id ?? null,
      updated_at: agora,
    })),
    { onConflict: "unit_id,platform,nome_item" },
  )
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true, gravados: validas.length, ignorados }
}

/**
 * Salva a lista de categorias padrão do cliente.
 *
 * Recebe a lista inteira e substitui: é um campo de texto onde a pessoa
 * escreve uma por linha, então "o que ficou lá" é o estado desejado. Diff por
 * item exigiria id no cliente e não ganharia nada numa lista de dez linhas.
 *
 * ⚠️ APAGAR UMA CATEGORIA DAQUI NÃO APAGA A DOS ITENS. `item_custos.categoria`
 * é texto e continua onde está — some só a sugestão. Tirar a categoria de mil
 * itens porque alguém corrigiu uma lista seria destruição silenciosa.
 */
export async function salvarCategoriasPadrao(
  nomes: string[],
): Promise<EstadoCusto> {
  // Esta continua de admin: a lista vale pra REDE inteira, não pra uma loja.
  try {
    const { requireAdmin } = await import("@/lib/auth/guards")
    await requireAdmin()
  } catch {
    return { ok: false, erro: "Apenas o administrador altera as categorias." }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, erro: "Cliente não identificado." }

  const limpos: string[] = []
  for (const n of nomes) {
    const v = n.trim().slice(0, 60)
    // Sem repetidos, ignorando caixa: "Bebidas" e "bebidas" são a mesma.
    if (v && !limpos.some((x) => x.toLowerCase() === v.toLowerCase())) {
      limpos.push(v)
    }
  }

  const admin = createAdminClient()
  const { error: erroDel } = await admin
    .from("item_categorias")
    .delete()
    .eq("holding_id", holdingId)
  if (erroDel) return { ok: false, erro: erroDel.message }

  if (limpos.length > 0) {
    const { error } = await admin.from("item_categorias").insert(
      limpos.map((nome, i) => ({ holding_id: holdingId, nome, ordem: i })),
    )
    if (error) return { ok: false, erro: error.message }
  }

  revalidatePath("/ficha-tecnica")
  return { ok: true }
}

/**
 * Ações em massa sobre as linhas selecionadas.
 *
 * Um só ponto de entrada porque as três operações (categoria, custo fixo e
 * custo como % do preço) compartilham a mesma trava de escopo e o mesmo upsert.
 * Separar em três actions triplicaria a checagem de permissão — e é sempre a
 * terceira cópia que esquece de checar.
 *
 * ⚠️ `custoPctPreco` chega com o PREÇO de cada linha vindo do cliente, e isso é
 * seguro porque preço não é dado de entrada: é receita ÷ quantidade, que o
 * servidor recalcula em toda leitura. Se alguém forjar um preço aqui, grava um
 * custo errado NA PRÓPRIA LOJA dele — não vaza nem altera dado de terceiro.
 */
export async function aplicarEmMassa(input: {
  unitId: string
  alvos: { platform: string; nomeItem: string; precoMedio: number }[]
  categoria?: string | null
  custo?: number | null
  custoPctPreco?: number | null
}): Promise<EstadoCusto & { gravados?: number }> {
  if (!(await podeEscrever(input.unitId))) {
    return { ok: false, erro: "Você não tem acesso a esta loja." }
  }

  const validos = input.alvos.filter(
    (a) =>
      PLATAFORMAS_CUSTO.includes(a.platform as never) && a.nomeItem.trim() !== "",
  )
  if (validos.length === 0) return { ok: true, gravados: 0 }

  const mexeCusto =
    input.custo !== undefined || input.custoPctPreco !== undefined
  const mexeCategoria = input.categoria !== undefined
  if (!mexeCusto && !mexeCategoria) {
    return { ok: false, erro: "Nada para aplicar." }
  }

  if (
    input.custoPctPreco !== undefined &&
    input.custoPctPreco !== null &&
    (!Number.isFinite(input.custoPctPreco) ||
      input.custoPctPreco < 0 ||
      input.custoPctPreco > 100)
  ) {
    return { ok: false, erro: "Percentual inválido." }
  }
  if (
    input.custo !== undefined &&
    input.custo !== null &&
    (!Number.isFinite(input.custo) || input.custo < 0)
  ) {
    return { ok: false, erro: "Custo inválido." }
  }

  const user = await getAuthUser()
  const agora = new Date().toISOString()

  const linhas = validos.map((a) => {
    const linha: Record<string, unknown> = {
      unit_id: input.unitId,
      platform: a.platform,
      nome_item: a.nomeItem.trim(),
      updated_by: user?.id ?? null,
      updated_at: agora,
    }
    if (mexeCategoria) {
      const cat = (input.categoria ?? "").trim().slice(0, 60)
      linha.categoria = cat === "" ? null : cat
    }
    if (input.custoPctPreco !== undefined && input.custoPctPreco !== null) {
      linha.custo = Math.round(a.precoMedio * (input.custoPctPreco / 100) * 100) / 100
    } else if (input.custo !== undefined) {
      linha.custo = input.custo
    }
    return linha
  })

  const { error } = await createAdminClient()
    .from("item_custos")
    .upsert(linhas, { onConflict: "unit_id,platform,nome_item" })
  if (error) return { ok: false, erro: error.message }

  revalidatePath("/ficha-tecnica")
  return { ok: true, gravados: linhas.length }
}
