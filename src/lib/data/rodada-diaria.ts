import "server-only"

/**
 * O que as rotinas de sincronização TROUXERAM nas últimas 24h.
 *
 * O relatório de saúde já respondia "as rotinas rodaram?" e "cada loja tem dado
 * recente?". Faltava a terceira pergunta, que é a que pega falha silenciosa:
 * **quanto entrou hoje?** Um cron pode responder 200, marcar `ok` e não ter
 * trazido linha nenhuma — e o painel continua verde porque os dados de ontem
 * ainda estão lá.
 *
 * Foi exatamente o que aconteceu em 08/ago/26: a rodada das 06h rodou nas 64
 * lojas, mas o extrato do mês corrente fechou em **14** delas — as outras 46
 * ficaram `enqueued` na fila do iFood. O e-mail daquele dia teria dito "tudo
 * certo", porque o cron rodou e as lojas tinham o dado de ontem.
 *
 * Por isso a régua aqui é OUTRA: não é "a rotina executou", é "o dado chegou".
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"
import { idsDeUnidadesDemo } from "@/lib/data/holding-demo"

import type { Gravidade } from "./saude-integracoes"

/** Dias sem fechar o extrato do mês corrente antes de virar observação. */
const EXTRATO_ATENCAO_D = 2
/** …e antes de virar alerta. Dois dias é fila lenta; quatro é loja travada. */
const EXTRATO_ALERTA_D = 4

/** Volume que entrou por fonte (uma linha por tipo de dado). */
export type RodadaFonte = {
  chave: string
  rotulo: string
  lojas: number
  linhas: number
  /** Horário da primeira e da última gravação — mostra se foi uma rodada só. */
  de: string
  ate: string
}

export type ExtratoAtrasado = {
  cliente: string
  loja: string
  /** Dias desde a última vez que o extrato do mês corrente foi baixado. */
  dias: number | null
  gravidade: Gravidade
  /**
   * O que o CLIENTE perde: última data com dado financeiro.
   *
   * Sem isto as linhas pareciam todas iguais ("nunca fechou o extrato deste
   * mês") e não dava pra separar quem conectou ontem de quem está cego há
   * três semanas — que é a diferença entre "espera" e "liga agora".
   */
  desdeQuando: string | null
}

/**
 * O dinheiro que o iFood repassa.
 *
 * Ganhou linha própria porque é a rotina cujo silêncio custa mais caro e a
 * que menos aparece: o extrato pode entrar em dia e o repasse ficar parado,
 * e aí o cliente vê venda que bate e conciliação que não fecha. Antes disso
 * o relatório inteiro não tinha uma linha sobre repasse.
 */
export type RepasseDoDia = {
  lojas: number
  linhas: number
  /** Dias desde o último sync bem-sucedido. `null` se nunca sincronizou. */
  diasSemSync: number | null
  gravidade: Gravidade
}

/**
 * Loja que o sistema decidiu não sincronizar, e por quê.
 *
 * Some do relatório sem deixar rastro — e se um cliente for suspenso por
 * engano, ninguém percebe pelo e-mail. Aqui ela reaparece como INFORMAÇÃO,
 * não como alarme.
 *
 * ⚠️ A DEMO NÃO ENTRA. Ela não é cliente e não sincroniza de propósito;
 * listá-la seria transformar dez linhas de configuração normal em ruído
 * permanente (Marcus, 31/08/26).
 */
export type ForaDoSync = {
  cliente: string
  lojas: number
  motivo: string
}

export type RodadaDiaria = {
  geradoEm: string
  competencia: string
  fontes: RodadaFonte[]
  totalLinhas: number
  totalLojas: number
  extrato: {
    /** Lojas que baixaram o extrato do mês corrente HOJE. */
    fecharamHoje: number
    /** Lojas com iFood conectado por API — o denominador. */
    conectadas: number
    /** Lojas atrasadas, da pior pra menos pior. */
    atrasadas: ExtratoAtrasado[]
  }
  repasse: RepasseDoDia
  foraDoSync: ForaDoSync[]
  gravidade: Gravidade
  motivo: string
}

const PLATAFORMA: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}
const TIPO: Record<string, string> = {
  pedidos: "Pedidos e pagamento",
  financeiro: "Extrato financeiro",
  avaliacoes: "Avaliações",
  cardapio: "Cardápio",
  promocoes: "Promoções",
  api: "Pedidos",
}
/** "ifood:pedidos" → "Pedidos e pagamento (iFood)". */
function rotuloFonte(chave: string): string {
  const [plat, tipo] = chave.split(":")
  return `${TIPO[tipo] ?? tipo} (${PLATAFORMA[plat] ?? plat})`
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })

/** YYYY-MM do mês corrente no fuso de São Paulo (não no UTC do servidor). */
function competenciaCorrente(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
  return f.format(new Date()).slice(0, 7)
}

const diasEntre = (a: string, b: Date) =>
  Math.floor((b.getTime() - new Date(a).getTime()) / 86_400_000)

export async function resumoDaRodada(): Promise<RodadaDiaria> {
  const admin = createAdminClient()
  const agora = new Date()
  const competencia = competenciaCorrente()
  const desde = new Date(agora.getTime() - 24 * 3_600_000).toISOString()

  type Imp = {
    unit_id: string
    platform: string
    report_type: string
    ref_year: number | null
    ref_month: number | null
    rows_imported: number | null
    imported_at: string
    source: string | null
    source_filename: string | null
  }

  const [{ data: recentesRaw }, { data: extratosRaw }, { data: conectadasRaw }] =
    await Promise.all([
      // Tudo que entrou nas últimas 24h — de qualquer plataforma, só via API.
      // Importação manual do cliente não é rotina automática e mediria outra
      // coisa (a disciplina dele, não a saúde do sistema).
      admin
        .from("platform_imports")
        .select(
          "unit_id, platform, report_type, ref_year, ref_month, rows_imported, imported_at, source, source_filename",
        )
        .eq("source", "api")
        .gte("imported_at", desde)
        .order("imported_at"),
      // Toda vez que o extrato do MÊS CORRENTE foi baixado, por loja. O nome
      // do arquivo carrega a competência, então dá pra separar do backfill de
      // meses fechados — que roda junto e inflaria a conta.
      admin
        .from("platform_imports")
        .select("unit_id, imported_at")
        .eq("platform", "ifood")
        .eq("source_filename", `API Reconciliation ${competencia}`)
        .order("imported_at", { ascending: false })
        .limit(2000),
      admin
        .from("unit_platforms")
        .select("unit_id")
        .eq("platform", "ifood")
        .eq("active", true)
        .not("api_store_id", "is", null),
    ])

  /* ⚠️ A MESMA EXCLUSÃO DO RESTO DO RELATÓRIO, NÃO SÓ A DEMO.
   *
   * Este contador filtrava só a conta demo e o painel de integrações filtrava
   * tudo que sai do sync — então o mesmo e-mail mostrava "88/91 iFood" no
   * topo e "fechou em 88/96 lojas" no rodapé. Duas frações parecidas com
   * denominadores diferentes, sem dizer que são bases diferentes, é como se
   * produz desconfiança no relatório inteiro (Marcus, 31/08/26). */
  const fora = await idsDeUnidadesForaDoSync()
  const noSync = <T extends { unit_id: string }>(xs: T[] | null) =>
    (xs ?? []).filter((x) => !fora.has(x.unit_id))
  const recentes = noSync(recentesRaw as { unit_id: string }[] | null)
  const extratos = noSync(extratosRaw as { unit_id: string }[] | null)
  const conectadas = noSync(conectadasRaw as { unit_id: string }[] | null)

  // ── Volume por fonte ────────────────────────────────────────────────────
  // O extrato vem com report_type 'financeiro' e source 'report' (é um arquivo
  // do iFood, não um endpoint), então ele NÃO entra no recorte acima. Puxo à
  // parte pelo nome do arquivo, senão a linha mais importante do relatório —
  // "o extrato chegou" — ficaria de fora dele.
  const { data: recentesExtrato } = await admin
    .from("platform_imports")
    .select("unit_id, ref_year, ref_month, rows_imported, imported_at")
    .eq("platform", "ifood")
    .like("source_filename", "API Reconciliation%")
    .gte("imported_at", desde)

  /* ⚠️ SEM DEDUPE O NÚMERO MENTE — e mente pra cima, que é o pior lado.
   *
   * Cada rodada REBAIXA o mês inteiro e regrava por cima (upsert). Somar todas
   * as importações de 24h conta a mesma planilha 2, 3, 5 vezes: na primeira
   * versão deste relatório deu "809.405 linhas novas", quando o volume real
   * era ~85 mil. Um número desses não só está errado como esconde queda —
   * cair pela metade ainda pareceria bastante.
   *
   * Então por (loja × tipo × competência) fica só a importação MAIS RECENTE.
   * O que sobra é "o tamanho do dado que está em pé agora", que é estável dia
   * a dia e por isso denuncia quando encolhe. */
  const ultimaPorChave = new Map<string, { fonte: string; unit: string; linhas: number; quando: string }>()
  const registrar = (r: {
    platform: string
    report_type: string
    unit_id: string
    ref_year?: number | null
    ref_month?: number | null
    rows_imported: number | null
    imported_at: string
  }) => {
    const fonte = `${r.platform}:${r.report_type}`
    const chave = `${fonte}|${r.unit_id}|${r.ref_year ?? "-"}-${r.ref_month ?? "-"}`
    const atual = ultimaPorChave.get(chave)
    if (atual && atual.quando >= r.imported_at) return
    ultimaPorChave.set(chave, {
      fonte,
      unit: r.unit_id,
      linhas: Number(r.rows_imported ?? 0),
      quando: r.imported_at,
    })
  }

  for (const r of (recentes ?? []) as Imp[]) registrar(r)
  // O extrato vem com source='report' (é arquivo, não endpoint), então não
  // entrou no recorte acima — mas é a linha que mais importa aqui.
  for (const r of noSync(recentesExtrato as { unit_id: string }[] | null) as unknown as {
    unit_id: string
    ref_year: number | null
    ref_month: number | null
    rows_imported: number | null
    imported_at: string
  }[]) {
    registrar({ ...r, platform: "ifood", report_type: "financeiro" })
  }

  const porFonte = new Map<
    string,
    { lojas: Set<string>; linhas: number; de: string; ate: string }
  >()
  for (const v of ultimaPorChave.values()) {
    const cur = porFonte.get(v.fonte) ?? {
      lojas: new Set<string>(),
      linhas: 0,
      de: v.quando,
      ate: v.quando,
    }
    cur.lojas.add(v.unit)
    cur.linhas += v.linhas
    if (v.quando < cur.de) cur.de = v.quando
    if (v.quando > cur.ate) cur.ate = v.quando
    porFonte.set(v.fonte, cur)
  }

  const fontes: RodadaFonte[] = [...porFonte.entries()]
    .map(([chave, v]) => ({
      chave,
      rotulo: rotuloFonte(chave),
      lojas: v.lojas.size,
      linhas: v.linhas,
      de: hhmm(v.de),
      ate: hhmm(v.ate),
    }))
    .sort((a, b) => b.linhas - a.linhas)

  // ── Extrato do mês corrente, loja a loja ────────────────────────────────
  const ultimoExtrato = new Map<string, string>()
  for (const e of (extratos ?? []) as { unit_id: string; imported_at: string }[]) {
    // A lista veio ordenada do mais novo pro mais velho: o primeiro que
    // aparece já é o último download daquela loja.
    if (!ultimoExtrato.has(e.unit_id)) ultimoExtrato.set(e.unit_id, e.imported_at)
  }

  const idsConectadas = [
    ...new Set(((conectadas ?? []) as { unit_id: string }[]).map((c) => c.unit_id)),
  ]
  const { data: nomes } = await admin
    .from("units")
    .select("id, name, brand_id, active")
    .in("id", idsConectadas.length ? idsConectadas : [ZERO_UUID])
  const { data: brands } = await admin.from("brands").select("id, holding_id")
  const { data: holdings } = await admin.from("holdings").select("id, name")
  const holdingDaBrand = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [
      b.id,
      b.holding_id,
    ]),
  )
  const nomeHolding = new Map(
    ((holdings ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]),
  )

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora)
  const diaDe = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(iso),
    )

  /* ⚠️ FORA DO SYNC NÃO ENTRA NO RELATÓRIO DE SAÚDE.
   *
   * O e-mail cobrava extrato de loja que o próprio sistema decidiu não
   * sincronizar: as duas do Vbfood, suspenso desde 22/08, apareceram em
   * 31/08 como "nunca fechou o extrato deste mês". Claro que não fecharam —
   * ninguém foi buscar. Cobrar trabalho de quem foi mandado parar é o tipo
   * de alarme que treina a pessoa a ignorar o e-mail inteiro.
   *
   * A regra existia num módulo só (`unidades-inativas`) justamente pra não
   * divergir, e os quatro coletores do relatório eram as cópias que nunca a
   * receberam. */
  let fecharamHoje = 0
  const atrasadas: ExtratoAtrasado[] = []
  for (const u of ((nomes ?? []) as {
    id: string
    name: string
    brand_id: string
    active: boolean
  }[]).filter((u) => u.active && !fora.has(u.id))) {
    const ultimo = ultimoExtrato.get(u.id) ?? null
    if (ultimo && diaDe(ultimo) === hoje) {
      fecharamHoje += 1
      continue
    }
    const dias = ultimo ? diasEntre(ultimo, agora) : null
    // Loja que NUNCA baixou o extrato deste mês é o caso mais grave: ou
    // acabou de conectar (e o primeiro dado ainda não veio), ou está travada
    // igual à Icaraí, que passou sete dias sem gerar.
    const grav: Gravidade =
      dias === null || dias >= EXTRATO_ALERTA_D
        ? "alerta"
        : dias >= EXTRATO_ATENCAO_D
          ? "atencao"
          : "ok"
    if (grav === "ok") continue
    atrasadas.push({
      cliente: nomeHolding.get(holdingDaBrand.get(u.brand_id) ?? "") ?? "—",
      loja: u.name,
      dias,
      gravidade: grav,
      desdeQuando: ultimo ? diaDe(ultimo) : null,
    })
  }
  atrasadas.sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999))

  const totalLinhas = fontes.reduce((s, f) => s + f.linhas, 0)
  const totalLojas = new Set(
    [...porFonte.values()].flatMap((v) => [...v.lojas]),
  ).size
  const comAlerta = atrasadas.filter((a) => a.gravidade === "alerta").length

  // Nada entrou em 24h com lojas conectadas é o pior cenário: é o silêncio que
  // este relatório existe pra quebrar.
  const gravidade: Gravidade =
    totalLinhas === 0 && idsConectadas.length > 0
      ? "alerta"
      : comAlerta > 0
        ? "alerta"
        : atrasadas.length > 0
          ? "atencao"
          : "ok"

  const motivo =
    totalLinhas === 0 && idsConectadas.length > 0
      ? "nenhum dado entrou nas últimas 24h"
      : comAlerta > 0
        ? `${comAlerta} loja(s) há ${EXTRATO_ALERTA_D}+ dias sem fechar o extrato do mês`
        : atrasadas.length > 0
          ? `${atrasadas.length} loja(s) com o extrato do mês atrasado`
          : `${totalLinhas.toLocaleString("pt-BR")} linhas atualizadas em ${totalLojas} lojas`

  return {
    geradoEm: agora.toISOString(),
    competencia,
    fontes,
    totalLinhas,
    totalLojas,
    extrato: {
      fecharamHoje,
      conectadas: idsConectadas.length,
      atrasadas,
    },
    repasse: await repasseDoDia(agora, fora),
    foraDoSync: await quemEstaForaDoSync(),
    gravidade,
    motivo,
  }
}

/** Dias sem sincronizar repasse antes de virar aviso e antes de virar alerta. */
const REPASSE_ATENCAO_D = 2
const REPASSE_ALERTA_D = 4

/**
 * O repasse do iFood — a rotina que o relatório não olhava.
 *
 * Extrato em dia e repasse parado é um estado possível e caro: o cliente vê
 * a venda bater e a conciliação não fechar, e a resposta "seu dado está
 * atualizado" fica tecnicamente certa e inútil.
 */
async function repasseDoDia(
  agora: Date,
  fora: Set<string>,
): Promise<RepasseDoDia> {
  const { data } = await createAdminClient()
    .from("ifood_repasses")
    .select("unit_id, synced_at")
    .order("synced_at", { ascending: false })
    .limit(5000)

  const linhas = ((data ?? []) as { unit_id: string; synced_at: string }[])
    .filter((r) => !fora.has(r.unit_id))
  const ultimo = linhas[0]?.synced_at ?? null
  const dias = ultimo ? diasEntre(ultimo, agora) : null

  return {
    lojas: new Set(linhas.map((r) => r.unit_id)).size,
    linhas: linhas.length,
    diasSemSync: dias,
    gravidade:
      dias === null || dias >= REPASSE_ALERTA_D
        ? "alerta"
        : dias >= REPASSE_ATENCAO_D
          ? "atencao"
          : "ok",
  }
}

/**
 * Quem está fora do sync, agrupado por cliente e com o motivo.
 *
 * ⚠️ SEM A DEMO. Ela não é cliente e não sincroniza de propósito — listá-la
 * seria transformar dez linhas de configuração normal em ruído permanente, e
 * ruído permanente é o que faz a pessoa parar de ler a seção.
 *
 * O resto entra porque some do relatório sem deixar rastro: se um cliente
 * for suspenso por engano, hoje ninguém percebe pelo e-mail.
 */
async function quemEstaForaDoSync(): Promise<ForaDoSync[]> {
  const admin = createAdminClient()
  const [fora, demo] = await Promise.all([
    idsDeUnidadesForaDoSync(),
    idsDeUnidadesDemo(),
  ])
  const alvo = [...fora].filter((id) => !demo.has(id))
  if (alvo.length === 0) return []

  const { data } = await admin
    .from("units")
    .select("id, active, brands!inner(holdings!inner(id, name, suspend_on, paid))")
    .in("id", alvo)

  const porCliente = new Map<string, { lojas: number; motivo: string }>()
  for (const u of (data ?? []) as unknown as {
    id: string
    active: boolean
    brands: { holdings: { name: string; suspend_on: string | null; paid: boolean } }
  }[]) {
    const h = u.brands.holdings
    /* A loja desativada no cadastro tem motivo PRÓPRIO, mesmo num cliente
       suspenso: são decisões diferentes e quem lê precisa saber qual desfazer. */
    const motivo = !u.active
      ? "desativada no cadastro"
      : h.suspend_on && !h.paid
        ? `assinatura suspensa desde ${h.suspend_on.slice(8, 10)}/${h.suspend_on.slice(5, 7)}`
        : "fora do sync"
    const chave = `${h.name}||${motivo}`
    const atual = porCliente.get(chave) ?? { lojas: 0, motivo }
    atual.lojas += 1
    porCliente.set(chave, atual)
  }

  return [...porCliente].map(([chave, v]) => ({
    cliente: chave.split("||")[0],
    lojas: v.lojas,
    motivo: v.motivo,
  }))
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000"
