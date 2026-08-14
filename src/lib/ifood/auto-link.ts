/**
 * Auto-vínculo de lojas iFood.
 *
 * Quando um cliente pede a conexão (botão "Pedir autorização" no cadastro) e
 * aprova no Portal do Parceiro, o merchant dele passa a aparecer no
 * GET /merchants do nosso app centralizado. Esta rotina fecha o último passo
 * SOZINHA: acha o merchant recém-autorizado e casa com a unidade que está
 * esperando conexão, grava o api_store_id, marca a solicitação como ativa e
 * devolve as lojas recém-vinculadas pra quem chamou disparar o backfill.
 *
 * ⚠️ A Merchant API NÃO expõe o CNPJ (nem na lista nem no detalhe) — só nome
 * e razão social. Então o casamento é por NOME, e só entre unidades que têm
 * uma SOLICITAÇÃO ABERTA (pendente/solicitada). Restringir às lojas que o
 * cliente pediu de propósito elimina o risco de vincular na loja errada:
 * uma unidade sem pedido nunca é tocada. Match ambíguo não vincula — vira
 * sugestão pro admin confirmar na tela.
 *
 * Roda no cron diário e no botão "Sincronizar iFood".
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { listAllIfoodMerchants, type IfoodMerchant } from "./merchants"
import { downloadReconciliationRows } from "./reconciliation"
import { syncIfoodAll } from "./sync"

/** Normaliza nome pra comparar: minúsculo, sem acento, sem pontuação, sem
 *  ruído societário/genérico. Vira conjunto de tokens. */
const STOPWORDS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "cia", "e", "de", "do", "da", "dos",
  "das", "restaurante", "lanchonete", "comercio", "alimentos", "food",
  "foods", "delivery", "parque", "shopping", "loja", "matriz", "filial",
])
function tokens(nome: string | null | undefined): Set<string> {
  return new Set(
    (nome ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  )
}
/** Fração dos tokens da unidade cobertos pelo nome do merchant (0–1). */
function coberturaNome(unitNome: string, merchant: IfoodMerchant): number {
  const u = tokens(unitNome)
  if (u.size === 0) return 0
  const m = new Set([
    ...tokens(merchant.name),
    ...tokens(merchant.corporateName),
  ])
  let hit = 0
  for (const t of u) if (m.has(t)) hit++
  return hit / u.size
}

/** Nome bem coberto — usado só pra PRIORIZAR candidatos e detectar conflito. */
const LIMIAR_AUTO = 0.8
/**
 * Teto de sondagens de CNPJ por loja. Cada sondagem pode baixar uma
 * conciliação; contar a tentativa, e não só os CNPJs encontrados, impede que
 * merchants novos sem extrato consumam toda a janela do cron.
 */
const MAX_SONDAGENS_CNPJ = 3

/** Só dígitos — CNPJ vem mascarado num lado e cru no outro. */
function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "")
}

/**
 * IDENTIDADE PELO `corporateName` — resolve o caso que a conciliação não resolve.
 *
 * O problema original: o CNPJ do merchant só existia dentro da conciliação, e
 * loja recém-conectada não tem extrato. Ou seja, o dado que identifica a loja
 * só aparece DEPOIS que ela fatura — justamente quando não precisamos mais.
 * Duas lojas da DG Foods ficaram semanas presas nisso.
 *
 * Descoberto em 03/ago/26 medindo a resposta real da API: o `corporateName` da
 * LISTA de merchants (sem chamada extra, sem depender de faturamento) traz a
 * identidade de dois jeitos:
 *
 *   1. MEI / firma individual → a RAIZ do CNPJ vem no texto:
 *      "58.654.266 PAMELA PEREIRA MARTINS" → 58654266
 *   2. LTDA → o texto é a RAZÃO SOCIAL, idêntica à que importamos da Receita:
 *      "CASA DO PAO PARQUE SAO VICENTE LTDA"
 *
 * Validado contra os 62 vínculos que já existiam e estão certos:
 * **39 acertos, 0 erros, 23 abstenções**.
 *
 * ⚠️ A unicidade tem que valer nos DOIS LADOS. Testando só o lado do merchant,
 * duas lojas de mesma razão social (Kawaii Poke e Santo Peixe) apontaram para o
 * MESMO merchant — dois vínculos errados. Vincular errado mistura o faturamento
 * de dois clientes e ninguém percebe até fechar o mês, então na dúvida NÃO
 * vincula: cai pro caminho antigo e, se ainda assim não der, pro humano.
 */
const RAIZ_NO_NOME = /(\d{2}\.\d{3}\.\d{3})/

function raizDoCorporateName(s: string | null | undefined): string {
  const m = RAIZ_NO_NOME.exec(s ?? "")
  return m ? soDigitos(m[1]) : ""
}

function normRazao(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

/** YYYY-MM do mês corrente e do anterior (onde procurar extrato). */
function competenciasParaSondar(): string[] {
  const d = new Date()
  const ym = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`
  return [ym(d), ym(new Date(d.getFullYear(), d.getMonth() - 1, 1))]
}

/**
 * CNPJ REAL de um merchant do iFood.
 *
 * ⚠️ A Merchant API não expõe CNPJ (nem na lista nem no detalhe) — mas a
 * **Conciliação** traz (coluna `cnpj`, ao lado de `loja_id`). Então a gente
 * descobre baixando um extrato e guarda em `ifood_merchants.cnpj`, pra as
 * próximas rodadas saírem de graça do cache.
 * Devolve null quando a loja ainda não tem extrato (sem movimento).
 */
/** Quanto tempo esperar antes de sondar de novo um merchant sem extrato. */
const REPESCAGEM_MS = 6 * 60 * 60 * 1000

async function cnpjDoMerchant(
  merchantId: string,
  admin: ReturnType<typeof createAdminClient>,
  /** Memória DESTA execução: o mesmo merchant é candidato de várias lojas. */
  sondadosAgora?: Set<string>,
): Promise<string | null> {
  const { data } = await admin
    .from("ifood_merchants")
    .select("cnpj, cnpj_sondado_em")
    .eq("id", merchantId)
    .maybeSingle()
  const row = data as {
    cnpj?: string | null
    cnpj_sondado_em?: string | null
  } | null
  const cache = soDigitos(row?.cnpj)
  if (cache.length === 14) return cache

  // Sem CNPJ: baixar a conciliação é caro, então não repetir à toa.
  // (1) na mesma execução, um merchant é candidato de VÁRIAS solicitações —
  //     sem isso, a mesma conciliação era baixada uma vez por loja testada.
  if (sondadosAgora?.has(merchantId)) return null
  // (2) entre execuções: loja recém-aberta não tem extrato e nunca vai ter
  //     dentro dos próximos minutos — o cron de 15 min tentava toda vez.
  const ultima = row?.cnpj_sondado_em
    ? Date.parse(row.cnpj_sondado_em)
    : 0
  if (ultima && Date.now() - ultima < REPESCAGEM_MS) return null
  sondadosAgora?.add(merchantId)
  await admin
    .from("ifood_merchants")
    .update({ cnpj_sondado_em: new Date().toISOString() })
    .eq("id", merchantId)

  for (const comp of competenciasParaSondar()) {
    try {
      const r = await downloadReconciliationRows(merchantId, comp)
      if (!r.ok) continue
      const linha = r.rows.find(
        (x) => soDigitos(String(x.cnpj ?? "")).length === 14,
      )
      const cnpj = soDigitos(String(linha?.cnpj ?? ""))
      if (cnpj.length === 14) {
        await admin
          .from("ifood_merchants")
          .update({ cnpj })
          .eq("id", merchantId)
        return cnpj
      }
    } catch {
      /* segue pro próximo mês */
    }
  }
  return null
}

export type AutoLinkResult = {
  ok: boolean
  error?: string
  /** Lojas que ACABARAM de ser vinculadas nesta rodada (disparar backfill). */
  vinculadas: {
    unitId: string
    unitCode: string
    unitName: string
    merchantId: string
    score: number
    /** CNPJ conferido na conciliação do merchant (o que autorizou o vínculo). */
    cnpj: string
  }[]
  /** Solicitações abertas sem CONFIRMAÇÃO de CNPJ — o admin resolve na tela. */
  ambiguas: {
    unitId: string
    unitName: string
    sugestao: { merchantId: string; name: string | null; score: number } | null
    /** Por que não vinculou (CNPJ conflitante, sem extrato, etc.). */
    motivo: string
  }[]
  merchantsVistos: number
  /** Solicitações que sobraram por falta de tempo — clicar de novo continua. */
  restantes: number
}

/**
 * Casa merchants autorizados (ao vivo) com unidades que TÊM solicitação
 * aberta, pelo nome. NÃO dispara o backfill — devolve as novas pra quem
 * chamou. `restrictUnitIds` limita ao escopo do tenant (botão manual).
 */
export async function autoLinkIfoodMerchants(
  restrictUnitIds?: string[] | null,
  opts?: {
    /**
     * Teto de tempo em ms. Ao estourar, para e devolve o que já casou com
     * `restantes` > 0 — quem chamou decide se roda de novo.
     *
     * Existe porque descobrir o CNPJ de um merchant custa o DOWNLOAD de uma
     * conciliação, e um clique com o cache frio (20 merchants sem CNPJ) passa
     * dos 300s da server action e morre sem gravar o resultado. Cada rodada
     * esquenta o cache, então a seguinte anda muito mais.
     *
     * Sem o parâmetro, roda até o fim — é o que o cron da madrugada quer.
     */
    deadlineMs?: number
  },
): Promise<AutoLinkResult> {
  const iniciou = Date.now()
  const semTempo = () =>
    opts?.deadlineMs !== undefined && Date.now() - iniciou > opts.deadlineMs
  const admin = createAdminClient()

  // 1) Merchants autorizados no app, ao vivo.
  const r = await listAllIfoodMerchants()
  if (!r.ok || !r.data) {
    return {
      ok: false,
      error: r.error ?? `HTTP ${r.status}`,
      vinculadas: [],
      ambiguas: [],
      merchantsVistos: 0,
      restantes: 0,
    }
  }
  const merchants = r.data as IfoodMerchant[]

  // Atualiza a cache local `ifood_merchants` de passagem (igual ao refresh).
  const cacheRows = merchants.map((m) => ({
    id: m.id,
    name: m.name ?? null,
    corporate_name: m.corporateName ?? null,
    city: m.address?.city ?? null,
    state: m.address?.state ?? null,
    merchant_state: m.merchantState ?? null,
    raw: m as unknown as object,
    last_seen_at: new Date().toISOString(),
  }))
  if (cacheRows.length > 0) {
    await admin
      .from("ifood_merchants")
      .upsert(cacheRows, { onConflict: "id", ignoreDuplicates: false })
  }

  // Merchants ainda NÃO vinculados a nenhuma unidade (candidatos).
  //
  // ⚠️ Esta leitura é DE PROPÓSITO sem filtro de empresa, e é a única do
  // sistema que deve ser assim: a pergunta aqui é "este merchant do iFood já
  // pertence a alguém?", e a resposta tem que valer para o sistema inteiro.
  // Escopar por cliente faria a mesma loja do iFood ser vinculada a duas
  // empresas diferentes. Só o `api_store_id` sai daqui -- nenhum dado de
  // operação, nenhum valor.
  const { data: linkedRows } = await admin
    .from("unit_platforms")
    .select("unit_id, api_store_id")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
  const merchantsJaVinculados = new Set(
    (linkedRows ?? []).map((x) => x.api_store_id as string),
  )
  const unidadesJaVinculadas = new Set(
    (linkedRows ?? []).map((x) => x.unit_id as string),
  )
  const candidatos = merchants.filter((m) => !merchantsJaVinculados.has(m.id))

  // CNPJ já descoberto de cada merchant, numa consulta só. Alimenta a passada
  // rápida abaixo — cada rodada anterior deixou aqui o que aprendeu baixando
  // conciliação, então a segunda passada num mesmo dia costuma casar sozinha.
  const cnpjPorMerchantCache = new Map<string, string>()
  if (candidatos.length > 0) {
    const { data: cach } = await admin
      .from("ifood_merchants")
      .select("id, cnpj")
      .in(
        "id",
        candidatos.map((m) => m.id),
      )
    for (const c of (cach ?? []) as { id: string; cnpj: string | null }[]) {
      const d = soDigitos(c.cnpj)
      if (d.length === 14) cnpjPorMerchantCache.set(c.id, d)
    }
  }

  // 2) Unidades COM solicitação aberta (pendente/solicitada) e iFood ativo
  //    sem vínculo — só essas entram no casamento (o cliente pediu).
  //    O `cnpj` do pedido é a chave de VERIFICAÇÃO (ver validação abaixo).
  /* Antes de casar: ADOTA os pedidos órfãos (unit_id nulo).
   *
   * Um pedido pode nascer sem loja vinculada — foi o caso da Vbfood em
   * 07/ago/26, pedido feito com o CNPJ certo e `unit_id` nulo. A consulta
   * abaixo usa `units!inner`, então esses pedidos eram DESCARTADOS pelo join:
   * o Marcus apertava "conferir e vincular", a loja nem era testada, e a tela
   * não dizia nada — nem sucesso, nem erro. Ficaria assim pra sempre.
   *
   * Aqui o pedido é adotado pela unidade de mesmo CNPJ, dentro da MESMA
   * holding (nunca entre clientes). Sem CNPJ não adota: sem chave, adivinhar
   * a loja seria pior que deixar pendente. */
  await admin.rpc("ifood_adotar_solicitacoes_orfas").then(
    () => undefined,
    (e: unknown) => {
      // Não derruba o auto-vínculo: no pior caso o pedido segue órfão, que é
      // o comportamento de antes.
      console.error("[auto-link] adoção de órfãs falhou:", e)
    },
  )

  let reqQ = admin
    .from("ifood_activation_requests")
    // razao_social vem junto: é uma das duas chaves de identidade pelo
    // `corporateName` do merchant (ver raizDoCorporateName).
    .select(
      "id, unit_id, status, cnpj, units!inner(id, code, name, razao_social)",
    )
    .in("status", ["pendente", "solicitada"])
    // Uma solicitação que acabou de ser sondada vai para o fim da fila. Sem
    // esta rotação, uma loja sem extrato pode consumir toda rodada de 15 min e
    // deixar as seguintes esperando para sempre.
    .order("last_auto_link_checked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
  if (restrictUnitIds) reqQ = reqQ.in("unit_id", restrictUnitIds)
  const { data: reqs, error: e1 } = await reqQ
  if (e1) {
    return {
      ok: false,
      error: e1.message,
      vinculadas: [],
      ambiguas: [],
      merchantsVistos: merchants.length,
      restantes: 0,
    }
  }

  const abertas = ((reqs ?? []) as unknown as {
    id: string
    unit_id: string
    cnpj: string | null
    units: {
      id: string
      code: string
      name: string
      /** Da Receita (import por CNPJ). Casa com o `corporateName` do merchant. */
      razao_social: string | null
    }
  }[]).filter((row) => !unidadesJaVinculadas.has(row.unit_id))

  const vinculadas: AutoLinkResult["vinculadas"] = []
  const ambiguas: AutoLinkResult["ambiguas"] = []
  const usados = new Set<string>()

  /** Registra a rodada mesmo quando não foi possível identificar a loja. */
  async function marcarTentativa(requestId: string): Promise<void> {
    const { error } = await admin
      .from("ifood_activation_requests")
      .update({ last_auto_link_checked_at: new Date().toISOString() })
      .eq("id", requestId)
    if (error) {
      // A falha de telemetria não pode bloquear um vínculo que é seguro.
      console.error("[auto-link] falhou ao registrar tentativa:", error.message)
    }
  }

  /** Vincula e marca a solicitação como ativa. Devolve false se o banco negou. */
  async function fechar(
    row: { unit_id: string; units: { code: string; name: string } },
    merchantId: string,
    score: number,
    cnpj: string,
  ): Promise<boolean> {
    // Liga os DOIS apps junto com o vínculo. Não é cosmético: são esses
    // carimbos que fazem a cobertura de importação parar de cobrar a planilha
    // de Conciliação e a de Avaliações. Sem eles a loja puxava tudo pela API
    // e o cliente continuava vendo "falta importar" das duas — a conexão
    // entrega os dois escopos de uma vez, então o estado tem que refletir isso.
    const agora = new Date().toISOString()
    const { error } = await admin.from("unit_platforms").upsert(
      {
        unit_id: row.unit_id,
        platform: "ifood",
        active: true,
        api_store_id: merchantId,
        fin_enabled_at: agora,
        review_enabled_at: agora,
      },
      { onConflict: "unit_id,platform", ignoreDuplicates: false },
    )
    if (error) return false
    usados.add(merchantId)
    vinculadas.push({
      unitId: row.unit_id,
      unitCode: row.units.code,
      unitName: row.units.name,
      merchantId,
      score,
      cnpj,
    })
    await admin
      .from("ifood_activation_requests")
      .update({ status: "ativa", updated_at: new Date().toISOString() })
      .eq("unit_id", row.unit_id)
      .in("status", ["pendente", "solicitada"])
    return true
  }

  // PASSADA RÁPIDA (custo zero de rede): casa o que dá só com o CNPJ que já
  // está no cache de merchants. Antes, um merchant com CNPJ conhecido ainda
  // esperava a vez no loop caro e podia nem ser alcançado dentro do tempo.
  const pendentes: typeof abertas = []
  for (const row of abertas) {
    const cnpjPedido = soDigitos(row.cnpj)
    if (cnpjPedido.length !== 14) {
      pendentes.push(row)
      continue
    }
    const direto = candidatos.find(
      (m) =>
        !usados.has(m.id) &&
        soDigitos(cnpjPorMerchantCache.get(m.id)) === cnpjPedido,
    )
    if (direto) {
      const ok = await fechar(
        row,
        direto.id,
        coberturaNome(row.units.name, direto),
        cnpjPedido,
      )
      if (ok) continue
    }
    pendentes.push(row)
  }

  // Índices de identidade pelo `corporateName`, montados UMA vez por rodada.
  // Guardam quantos merchants E quantas solicitações caem em cada chave: só
  // vale quando é 1 de cada lado (ver raizDoCorporateName).
  const merchantsPorRaiz = new Map<string, IfoodMerchant[]>()
  const merchantsPorRazao = new Map<string, IfoodMerchant[]>()
  for (const m of candidatos) {
    if (usados.has(m.id)) continue
    const raiz = raizDoCorporateName(m.corporateName)
    if (raiz) merchantsPorRaiz.set(raiz, [...(merchantsPorRaiz.get(raiz) ?? []), m])
    const rz = normRazao(m.corporateName)
    if (rz) merchantsPorRazao.set(rz, [...(merchantsPorRazao.get(rz) ?? []), m])
  }
  const pedidosPorRaiz = new Map<string, number>()
  const pedidosPorRazao = new Map<string, number>()
  for (const row of pendentes) {
    const c = soDigitos(row.cnpj)
    if (c.length === 14) {
      const k = c.slice(0, 8)
      pedidosPorRaiz.set(k, (pedidosPorRaiz.get(k) ?? 0) + 1)
    }
    const rz = normRazao(row.units.razao_social)
    if (rz) pedidosPorRazao.set(rz, (pedidosPorRazao.get(rz) ?? 0) + 1)
  }

  /** Merchant identificado sem custo, ou null se houver qualquer dúvida. */
  function porCorporateName(row: (typeof pendentes)[number]): {
    m: IfoodMerchant
    via: string
  } | null {
    const c = soDigitos(row.cnpj)
    if (c.length === 14) {
      const k = c.slice(0, 8)
      const ms = merchantsPorRaiz.get(k)
      if (ms?.length === 1 && pedidosPorRaiz.get(k) === 1)
        return { m: ms[0], via: "raiz do CNPJ no nome empresarial" }
    }
    const rz = normRazao(row.units.razao_social)
    if (rz) {
      const ms = merchantsPorRazao.get(rz)
      if (ms?.length === 1 && pedidosPorRazao.get(rz) === 1)
        return { m: ms[0], via: "razão social idêntica" }
    }
    return null
  }

  // Compartilhado por todas as solicitações desta rodada.
  const { merchantsSumidos, sumidoPorCnpj } = await import(
    "@/lib/ifood/merchants-sumidos"
  )
  const sumidos = await merchantsSumidos()
  const sondadosAgora = new Set<string>()
  let processadas = 0
  for (const row of pendentes) {
    if (semTempo()) break
    processadas++
    await marcarTentativa(row.id)
    const cnpjPedido = soDigitos(row.cnpj)
    if (cnpjPedido.length !== 14) {
      ambiguas.push({
        unitId: row.unit_id,
        unitName: row.units.name,
        sugestao: null,
        motivo: "Solicitação sem CNPJ válido — não dá pra verificar.",
      })
      continue
    }

    // PRIMEIRO o caminho de graça: identidade pelo `corporateName`. Resolve a
    // loja recém-conectada, que não tem extrato e por isso nunca fecharia pelo
    // CNPJ. Só decide quando é inequívoco nos dois lados.
    const direto = porCorporateName(row)
    if (direto && !usados.has(direto.m.id)) {
      const ok = await fechar(
        row,
        direto.m.id,
        coberturaNome(row.units.name, direto.m),
        cnpjPedido,
      )
      if (ok) {
        console.log(
          `[auto-link] ${row.units.name} → ${direto.m.name} (${direto.via})`,
        )
        continue
      }
    }

    // Ordena candidatos por cobertura de nome: o nome NÃO decide, só define
    // quem testamos primeiro (cada teste custa uma conciliação).
    const ordenados = candidatos
      .filter((m) => !usados.has(m.id))
      .map((m) => ({ m, score: coberturaNome(row.units.name, m) }))
      .sort((a, b) => b.score - a.score)

    // Quem DECIDE é o CNPJ: pega o CNPJ real do merchant (cache → conciliação)
    // e só vincula quando bate com o CNPJ que o cliente pediu. É o que impede
    // trocar filiais de mesmo nome/raiz (ex.: 32.196.377/0001, /0002, /0003).
    let escolhido: { m: IfoodMerchant; score: number } | null = null
    let sondagens = 0
    let cnpjsConfirmados = 0
    let conflito: string | null = null
    for (const cand of ordenados) {
      if (sondagens >= MAX_SONDAGENS_CNPJ) break
      sondagens++
      const cnpjMerchant = await cnpjDoMerchant(cand.m.id, admin, sondadosAgora)
      if (!cnpjMerchant) continue // sem extrato pra verificar; tenta o próximo
      cnpjsConfirmados++
      if (cnpjMerchant === cnpjPedido) {
        escolhido = cand
        break
      }
      if (cand.score >= LIMIAR_AUTO) {
        // Nome batia forte mas o CNPJ é de OUTRA loja — o caso perigoso.
        conflito = `O merchant "${cand.m.name ?? cand.m.id}" tem nome parecido mas é o CNPJ ${cnpjMerchant} (o pedido é ${cnpjPedido}).`
      }
    }

    if (escolhido) {
      const ok = await fechar(
        row,
        escolhido.m.id,
        escolhido.score,
        cnpjPedido,
      )
      if (ok) continue
    }

    // Não confirmou por CNPJ → NÃO vincula (o admin resolve na tela).
    const melhor = ordenados[0]
    ambiguas.push({
      unitId: row.unit_id,
      unitName: row.units.name,
      sugestao: melhor
        ? {
            merchantId: melhor.m.id,
            name: melhor.m.name ?? null,
            score: melhor.score,
          }
        : null,
      motivo:
        conflito ??
        /* O FATO, e não um palpite de causa.
         *
         * Antes esta mensagem afirmava "o lojista ainda não autorizou". Só que
         * o que a gente sabe é uma coisa só: o CNPJ não veio na lista que o
         * iFood devolve. Isso tem DUAS causas possíveis e a API não distingue:
         *
         *   • o lojista realmente não aprovou (portal mostra "Aguardando
         *     Ativação"); ou
         *   • está aprovado e o iFood não entrega mesmo assim.
         *
         * A segunda não é hipótese: em 13/ago/26 as 3 lojas da Tech Assessoria
         * apareciam "Ativo" no portal e a API respondia 403 — virou chamado
         * aberto com eles. Nesses casos a mensagem antiga mandava cobrar do
         * cliente uma aprovação que ele já tinha feito, e o problema ficava
         * parado esperando a pessoa errada.
         *
         * Então: diz o que é verdade e entrega a conferência que separa as
         * duas causas em dez segundos. */
        (sumidoPorCnpj(sumidos, cnpjPedido)
          ? `Esta loja JÁ apareceu no iFood e sumiu da lista. Confira no Portal do Parceiro (aba Permissões, busque ${cnpjPedido}): se estiver "Aguardando Ativação", o lojista precisa aprovar de novo; se estiver "Ativo", o iFood parou de devolver a loja pra gente — aí é problema deles.`
          : cnpjsConfirmados === 0
            ? `A API devolveu merchants, mas nenhum dos ${sondagens} candidatos mais compatíveis trouxe conciliação para confirmar o CNPJ. Pode ser loja sem movimento; não vamos vincular sem prova.`
            : `A API devolveu merchants, mas nenhum dos ${cnpjsConfirmados} CNPJs confirmados entre os ${sondagens} candidatos mais compatíveis bate com ${cnpjPedido}. Confira no Portal do Parceiro (aba Permissões, busque o CNPJ): se estiver "Ativo", envie este diagnóstico ao iFood.`),
    })
  }

  return {
    ok: true,
    vinculadas,
    ambiguas,
    merchantsVistos: merchants.length,
    restantes: pendentes.length - processadas,
  }
}

/**
 * Competências de JANEIRO DE 2026 até o mês corrente.
 *
 * O início é fixo em 2026-01 de propósito, e não "janeiro do ano corrente".
 * Era assim antes e passaria despercebido até a virada: em janeiro de 2027,
 * loja nova nasceria só com 2027-01 e nenhum mês de 2026 — sem comparativo
 * ano contra ano justamente pra quem acabou de entrar. Decisão do Marcus:
 * sempre desde janeiro de 2026.
 *
 * 2026-01 é o piso porque é quando a operação começou a ter dado no iFood;
 * pedir mês anterior a isso é gastar chamada pra receber vazio.
 */
export const INICIO_HISTORICO = { ano: 2026, mes: 1 }

export function competenciasDesdeInicio(now = new Date()): string[] {
  const out: string[] = []
  let ano = INICIO_HISTORICO.ano
  let mes = INICIO_HISTORICO.mes
  const anoFim = now.getFullYear()
  const mesFim = now.getMonth() + 1
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    out.push(`${ano}-${String(mes).padStart(2, "0")}`)
    mes++
    if (mes > 12) {
      mes = 1
      ano++
    }
  }
  return out
}

/** Teto de lojas a puxar o histórico completo por rodada — evita estourar o
 *  timeout (300s), já que o cron ainda roda o sync da rede toda depois. Loja
 *  vinculada e não backfillada agora entra na próxima rodada (já está
 *  vinculada, e o sync do dia traz mês corrente + anterior no meio tempo).
 *  Como lojas novas chegam aos poucos, 2/rodada dá conta com folga. */
const MAX_BACKFILL_POR_RODADA = 2

export type AutoLinkBackfillResult = AutoLinkResult & {
  backfill: {
    /** Necessário pra avisar o cliente logo depois — não é só rótulo. */
    unitId: string
    unitCode: string
    unitName: string
    linhas: number
    meses: number
  }[]
  backfillAdiado: { unitCode: string; unitName: string }[]
}

/**
 * Auto-vínculo + backfill do histórico das lojas novas, numa tacada. Backfill
 * SEQUENCIAL por loja (dentro da loja o syncIfoodAll já paraleliza as
 * competências) — nunca N lojas × N meses em paralelo, que já apagou mês.
 */
export async function autoLinkAndBackfill(
  restrictUnitIds?: string[] | null,
): Promise<AutoLinkBackfillResult> {
  const link = await autoLinkIfoodMerchants(restrictUnitIds)
  const backfill: AutoLinkBackfillResult["backfill"] = []
  const backfillAdiado: AutoLinkBackfillResult["backfillAdiado"] = []
  if (!link.ok) return { ...link, backfill, backfillAdiado }

  const hist = await backfillPendentes()
  return { ...link, backfill: hist.backfill, backfillAdiado: hist.backfillAdiado }
}

/**
 * Puxa o histórico completo das lojas conectadas que ainda não o têm.
 *
 * Separada do auto-vínculo de propósito: quem vincula e quem puxa histórico
 * são perguntas diferentes, e o cron de 15 minutos precisa das duas — ele é
 * quem DETECTA a autorização do cliente, e parar no vínculo deixava a loja com
 * dois meses de dado até alguém notar.
 *
 * Sequencial por loja: dentro da loja o syncIfoodAll já paraleliza as
 * competências, e N lojas × N meses em paralelo já apagou mês neste projeto.
 */
export async function backfillPendentes(
  opts: { deadlineMs?: number } = {},
): Promise<{
  backfill: AutoLinkBackfillResult["backfill"]
  backfillAdiado: AutoLinkBackfillResult["backfillAdiado"]
}> {
  const backfill: AutoLinkBackfillResult["backfill"] = []
  const backfillAdiado: AutoLinkBackfillResult["backfillAdiado"] = []
  const comps = competenciasDesdeInicio()
  const t0 = Date.now()
  const limite = opts.deadlineMs ?? Number.POSITIVE_INFINITY

  const pendentes = await lojasSemHistorico()
  const aBackfillar = pendentes.slice(0, MAX_BACKFILL_POR_RODADA)
  for (const v of pendentes.slice(MAX_BACKFILL_POR_RODADA))
    backfillAdiado.push({ unitCode: v.unitCode, unitName: v.unitName })

  for (const v of aBackfillar) {
    // Uma loja leva ~2,7 min (medido na Pizzaria Quero Mais, 8 competências).
    // Começar uma que não vai caber é gastar chamada de API pra ser cortado no
    // meio — e meio backfill não carimba, então voltaria pra fila do mesmo
    // jeito, tendo queimado o tempo.
    if (Date.now() - t0 > limite - 180_000) {
      backfillAdiado.push({ unitCode: v.unitCode, unitName: v.unitName })
      continue
    }
    try {
      const res = await syncIfoodAll({
        unitIds: [v.unitId],
        competences: comps,
        force: true,
      })
      const u = res.results[0]
      const linhas = (u?.reconciliation ?? []).reduce(
        (s, x) => s + (x.persisted ?? 0),
        0,
      )
      const meses = (u?.reconciliation ?? []).filter(
        (x) => (x.persisted ?? 0) > 0,
      ).length
      // ⚠️ O sinal é "A API RESPONDEU", não "achou dado".
      //
      // Era `meses > 0`, e isso trata "não existe nada antes" como fracasso:
      // loja que abriu em maio nunca teria janeiro, ficaria sem carimbo e
      // seria tentada de novo todo dia, pra sempre — 8 competências, ~2,7 min,
      // sem fim. Aconteceu com 4 lojas em 09/08/26 (Forno a Lenha, Ipiranga,
      // Ki Delicia, Nagay).
      //
      // `ok` distingue as duas coisas: veio 200 e a competência estava vazia
      // (pergunta respondida, nada a puxar) versus não consegui falar com a
      // API (aí não carimba e volta pra fila mesmo).
      const respondeu = (u?.reconciliation ?? []).some((x) => x.ok === true)
      if (respondeu) {
        await createAdminClient()
          .from("unit_platforms")
          .update({ historico_backfill_at: new Date().toISOString() })
          .eq("unit_id", v.unitId)
          .eq("platform", "ifood")
      }
      backfill.push({
        unitId: v.unitId,
        unitCode: v.unitCode,
        unitName: v.unitName,
        linhas,
        meses,
      })
    } catch {
      backfillAdiado.push({ unitCode: v.unitCode, unitName: v.unitName })
    }
  }

  return { backfill, backfillAdiado }
}

/**
 * Lojas do iFood conectadas e sem histórico completo — a fila do backfill.
 *
 * Independe de quem vinculou e de quando: basta ter `api_store_id` e não ter
 * o carimbo. É o que faz a fila sobreviver a reinício, a deploy e a loja
 * vinculada por um caminho que não é o cron.
 */
async function lojasSemHistorico(): Promise<
  { unitId: string; unitCode: string; unitName: string }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("unit_platforms")
    .select("unit_id, units(code, name, active)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
    .is("historico_backfill_at", null)

  return ((data ?? []) as unknown as {
    unit_id: string
    units: { code: string; name: string; active: boolean } | null
  }[])
    // Loja desativada não entra: puxar o ano de quem fechou as portas é gastar
    // chamada de API à toa — a mesma razão que tirou as inativas do sync.
    .filter((r) => r.units?.active)
    .map((r) => ({
      unitId: r.unit_id,
      unitCode: r.units?.code ?? "—",
      unitName: r.units?.name ?? "—",
    }))
}
