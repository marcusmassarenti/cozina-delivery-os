/**
 * Diagnóstico diário das integrações.
 *
 * A pergunta que este módulo responde NÃO é "chegou dado hoje?". É:
 *
 *     o dado de cada loja está tão fresco quanto a loja está vendendo?
 *
 * A diferença é a única coisa que separa alarme útil de alarme ignorado.
 * Loja parada não gera lançamento nenhum — comparar contra o calendário faria
 * toda loja de 2 pedidos por semana acender vermelho todo dia, e em uma semana
 * ninguém mais lê o relatório. Duas lojas (Ki Delicia e Osasco) pareciam
 * paradas há dias na primeira checagem: o financeiro delas estava na data do
 * último pedido. Estavam certas; a régua é que estava errada.
 *
 * Então a régua é por loja, contra ela mesma: se a loja vendeu ontem e o
 * financeiro dela parou anteontem, isso é falha. Se ela não vende há cinco
 * dias, dado de cinco dias atrás é o dado correto.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Horas de atraso entre o último pedido e o financeiro pra virar alerta. */
const TOLERANCIA_HORAS = 48
/** Horas depois de conectar antes de cobrar o primeiro dado. */
const CARENCIA_PRIMEIRO_DADO_H = 24
/** Um cron sem execução por mais que isto está parado. */
const CRON_ATRASADO_H = 26

export type Gravidade = "ok" | "atencao" | "alerta"

/** As duas plataformas que hoje têm integração por API. */
export type PlataformaSaude = "ifood" | "99food"

export type LojaSaude = {
  cliente: string
  unitId: string
  code: string
  loja: string
  plataforma: PlataformaSaude
  conectadaEm: string | null
  ultimoPedido: string | null
  ultimoFinanceiro: string | null
  ultimaAvaliacao: string | null
  pedidos7d: number
  gravidade: Gravidade
  motivo: string
}

export type CronSaude = {
  nome: string
  ultimaExecucao: string | null
  ok: boolean | null
  duracaoMs: number | null
  erro: string | null
  gravidade: Gravidade
  motivo: string
}

export type SaudeIntegracoes = {
  geradoEm: string
  lojas: LojaSaude[]
  crons: CronSaude[]
  resumo: {
    lojasConectadas: number
    ifood: { total: number; ok: number; alerta: number }
    noveNove: { total: number; ok: number; alerta: number }
    lojasOk: number
    lojasAtencao: number
    lojasAlerta: number
    cronsOk: number
    cronsProblema: number
  }
  /** true = nada exige ação. Define o assunto do e-mail. */
  tudoCerto: boolean
  /** Há itens em observação (não são falha, mas ainda não são "ok"). */
  temObservacao: boolean
}

const horasEntre = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000

export async function diagnosticarIntegracoes(): Promise<SaudeIntegracoes> {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  // ── Lojas conectadas por API, nas duas plataformas ─────────────────────
  // A fonte é a função saude_lojas(), que junta iFood (unit_platforms) e
  // 99 Food (ninefood_store_links). Antes esta parte partia só de
  // unit_platforms e as lojas da 99 ficavam invisíveis: o relatório dizia
  // "41/41 ok" sem nunca ter olhado sete lojas. Silêncio parecendo saúde é
  // pior que alerta.
  type Sinal = {
    unit_id: string
    plataforma: PlataformaSaude
    conectada_em: string | null
    ultimo_pedido: string | null
    ultimo_financeiro: string | null
    ultima_avaliacao: string | null
    pedidos_7d: number
  }
  const { data: sinais, error: erroSinais } = await admin.rpc("saude_lojas")
  if (erroSinais) console.error("saude_lojas:", erroSinais.message)
  const linhas = (sinais ?? []) as Sinal[]

  const unitIds = [...new Set(linhas.map((s) => s.unit_id))]
  const { data: units } = await admin
    .from("units")
    .select("id, code, name, brand_id, active")
    .in("id", unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"])
  const { data: brands } = await admin.from("brands").select("id, holding_id")
  const { data: holdings } = await admin.from("holdings").select("id, name")

  const nomeHolding = new Map(
    ((holdings ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]),
  )
  const holdingDaBrand = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [b.id, b.holding_id]),
  )
  const unitInfo = new Map(
    ((units ?? []) as { id: string; code: string; name: string; brand_id: string; active: boolean }[])
      .map((u) => [
        u.id,
        {
          code: u.code,
          nome: u.name,
          ativa: u.active,
          cliente: nomeHolding.get(holdingDaBrand.get(u.brand_id) ?? "") ?? "—",
        },
      ]),
  )

  const lojas: LojaSaude[] = []
  for (const s of linhas) {
    const info = unitInfo.get(s.unit_id)
    if (!info || !info.ativa) continue

    const pedido = s.ultimo_pedido
    const fin = s.ultimo_financeiro
    const qtd7d = Number(s.pedidos_7d ?? 0)

    let gravidade: Gravidade = "ok"
    let motivo = "dado em dia com as vendas"

    if (!fin) {
      const horasLigada = s.conectada_em ? horasEntre(s.conectada_em, agora) : 999
      if (horasLigada < CARENCIA_PRIMEIRO_DADO_H) {
        gravidade = "atencao"
        motivo = "conectada há pouco — primeira carga ainda não veio"
      } else {
        gravidade = "alerta"
        motivo = `conectada há ${Math.floor(horasLigada / 24)} dias e nunca trouxe dado`
      }
    } else if (pedido) {
      // A régua: financeiro atrasado EM RELAÇÃO ao próprio movimento da loja.
      const atraso = horasEntre(fin, `${pedido}T23:59:59-03:00`)
      if (atraso > TOLERANCIA_HORAS) {
        gravidade = qtd7d > 0 ? "alerta" : "atencao"
        motivo =
          qtd7d > 0
            ? `vendeu até ${fmt(pedido)} mas o financeiro parou em ${fmt(fin)}`
            : `financeiro em ${fmt(fin)}; loja sem pedido há dias (provável loja parada)`
      }
    }

    lojas.push({
      cliente: info.cliente,
      unitId: s.unit_id,
      code: info.code,
      loja: info.nome,
      plataforma: s.plataforma,
      conectadaEm: s.conectada_em,
      ultimoPedido: pedido,
      ultimoFinanceiro: fin,
      ultimaAvaliacao: s.ultima_avaliacao,
      pedidos7d: qtd7d,
      gravidade,
      motivo,
    })
  }

  lojas.sort((a, b) => {
    const peso = { alerta: 0, atencao: 1, ok: 2 }
    return (
      peso[a.gravidade] - peso[b.gravidade] ||
      a.cliente.localeCompare(b.cliente) ||
      a.loja.localeCompare(b.loja) ||
      a.plataforma.localeCompare(b.plataforma)
    )
  })

  // ── Crons ───────────────────────────────────────────────────────────────
  const ESPERADOS = [
    "ifood-sync",
    "ifood-review-sync",
    "ifood-auto-vincular",
    "ninefood-sync",
    "process-99-webhooks",
    "billing-vencimentos",
    "emitir-faturas",
    "regua-email",
  ]
  const { data: runs } = await admin
    .from("cron_runs")
    .select("nome, iniciado_em, ok, duracao_ms, erro")
    .order("iniciado_em", { ascending: false })
    .limit(400)

  const ultimoPorCron = new Map<string, Record<string, unknown>>()
  for (const r of (runs ?? []) as Record<string, unknown>[]) {
    const n = String(r.nome)
    if (!ultimoPorCron.has(n)) ultimoPorCron.set(n, r)
  }

  // Há quanto tempo o medidor existe?
  //
  // Um cron sem NENHUM registro só pode ser chamado de parado depois que a
  // instrumentação viveu uma volta completa de 24h — antes disso, "nunca
  // registrou" significa "o horário dele ainda não chegou desde que ligamos".
  //
  // A primeira versão desta regra usava outra âncora: "algum cron registrou
  // recentemente". Ela errou feio no primeiro teste — bastou uma execução
  // manual do ifood-sync pra sete crons que tinham rodado normalmente de
  // manhã aparecerem como parados. Sete alertas falsos vindos justamente da
  // regra escrita pra evitar alerta falso.
  const { data: primeira } = await admin
    .from("cron_runs")
    .select("iniciado_em")
    .order("iniciado_em", { ascending: true })
    .limit(1)
    .maybeSingle()
  const horasDeMedicao = primeira?.iniciado_em
    ? horasEntre(String(primeira.iniciado_em), agora)
    : 0
  const medidorMaduro = horasDeMedicao >= CRON_ATRASADO_H

  const crons: CronSaude[] = ESPERADOS.map((nome) => {
    const r = ultimoPorCron.get(nome)
    if (!r) {
      return {
        nome,
        ultimaExecucao: null,
        ok: null,
        duracaoMs: null,
        erro: null,
        // "Nunca rodou" só vira alerta depois que o registro existir há tempo
        // suficiente pra ter havido uma janela — senão o primeiro dia acusaria
        // os 8 de uma vez.
        gravidade: medidorMaduro ? "alerta" : "atencao",
        motivo: medidorMaduro
          ? "nunca registrou execução — está parado"
          : `sem registro ainda; medição ligada há ${Math.floor(horasDeMedicao)}h (o horário dele ainda não chegou)`,
      }
    }
    const quando = String(r.iniciado_em)
    const horas = horasEntre(quando, agora)
    if (r.ok === false)
      return {
        nome,
        ultimaExecucao: quando,
        ok: false,
        duracaoMs: (r.duracao_ms as number) ?? null,
        erro: (r.erro as string) ?? null,
        gravidade: "alerta",
        motivo: `última execução falhou: ${r.erro ?? "sem detalhe"}`,
      }
    if (horas > CRON_ATRASADO_H)
      return {
        nome,
        ultimaExecucao: quando,
        ok: true,
        duracaoMs: (r.duracao_ms as number) ?? null,
        erro: null,
        gravidade: "alerta",
        motivo: `sem rodar há ${Math.floor(horas)}h`,
      }
    return {
      nome,
      ultimaExecucao: quando,
      ok: true,
      duracaoMs: (r.duracao_ms as number) ?? null,
      erro: null,
      gravidade: "ok",
      motivo: "rodou nas últimas 24h",
    }
  })

  const porPlataforma = (p: string) => {
    const ls = lojas.filter((l) => l.plataforma === p)
    return {
      total: ls.length,
      ok: ls.filter((l) => l.gravidade === "ok").length,
      alerta: ls.filter((l) => l.gravidade === "alerta").length,
    }
  }

  const resumo = {
    lojasConectadas: lojas.length,
    ifood: porPlataforma("ifood"),
    noveNove: porPlataforma("99food"),
    lojasOk: lojas.filter((l) => l.gravidade === "ok").length,
    lojasAtencao: lojas.filter((l) => l.gravidade === "atencao").length,
    lojasAlerta: lojas.filter((l) => l.gravidade === "alerta").length,
    cronsOk: crons.filter((c) => c.gravidade === "ok").length,
    cronsProblema: crons.filter((c) => c.gravidade !== "ok").length,
  }

  return {
    geradoEm: agora,
    lojas,
    crons,
    resumo,
    // "Atenção" não acorda ninguém — só alerta. Loja conectada há 2 horas sem
    // dado é esperado, não é problema.
    tudoCerto: resumo.lojasAlerta === 0 && crons.every((c) => c.gravidade !== "alerta"),
    // Separado de propósito: dizer "tudo certo" com 8 rotinas ainda sem
    // registro é tecnicamente verdade e humanamente mentira. Quem lê vê o
    // selo verde ao lado de "0/8 rodando" e para de confiar no selo.
    temObservacao:
      resumo.lojasAtencao > 0 || crons.some((c) => c.gravidade === "atencao"),
  }
}

function fmt(iso: string): string {
  const d = iso.slice(0, 10).split("-")
  return `${d[2]}/${d[1]}`
}
