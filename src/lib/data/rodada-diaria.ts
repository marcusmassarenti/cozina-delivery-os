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

  const [{ data: recentes }, { data: extratos }, { data: conectadas }] =
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
  for (const r of (recentesExtrato ?? []) as {
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

  let fecharamHoje = 0
  const atrasadas: ExtratoAtrasado[] = []
  for (const u of ((nomes ?? []) as {
    id: string
    name: string
    brand_id: string
    active: boolean
  }[]).filter((u) => u.active)) {
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
    gravidade,
    motivo,
  }
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000"
