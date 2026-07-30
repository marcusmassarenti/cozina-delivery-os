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

/**
 * Atraso do financeiro em relação ao último pedido.
 *
 * DOIS degraus de propósito. A plataforma libera a conciliação em ritmo
 * próprio — o iFood solta a de uma loja em D-1 e a da vizinha em D-3 — então
 * gritar no primeiro dia de defasagem é gritar por causa do calendário deles,
 * não de defeito nosso. Em 29/07 foram seis lojas em vermelho por dois dias de
 * atraso, e nenhuma tinha problema nenhum.
 *
 * Passa a valer a MESMA folga da importação manual pro alerta: se planilha
 * pode atrasar dez dias sem virar emergência, dado de API que depende do
 * calendário da plataforma também pode.
 */
const TOLERANCIA_HORAS = 48
/** Horas depois de conectar antes de cobrar o primeiro dado. */
const CARENCIA_PRIMEIRO_DADO_H = 24
/**
 * Dias sem pedido que uma loja de importação MANUAL pode ficar antes de virar
 * alerta. Mais folgado que o da API de propósito: planilha depende de alguém
 * lembrar de subir, e cobrar diariamente encheria a tela de vermelho por um
 * atraso que é do processo, não do sistema.
 */
const DIAS_IMPORTACAO_MANUAL = 10

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
  /** false = plataforma marcada no cadastro, mas sem integração ligada. */
  conectada: boolean
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

/** Loja parada na fila de conexão do iFood — esperando alguém agir. */
export type FilaIfood = {
  cliente: string
  loja: string
  cnpj: string
  dias: number
  gravidade: Gravidade
  motivo: string
}

export type SaudeIntegracoes = {
  geradoEm: string
  lojas: LojaSaude[]
  filaIfood: FilaIfood[]
  crons: CronSaude[]
  resumo: {
    lojasConectadas: number
    ifood: { total: number; ok: number; alerta: number; semConexao: number }
    noveNove: { total: number; ok: number; alerta: number; semConexao: number }
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
    conectada: boolean
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

    if (!s.conectada) {
      // Declarada no cadastro e sem API ligada. Mas SEM API NÃO É SEM DADO:
      // metade das lojas da 99 entra por planilha importada à mão, e a
      // primeira versão desta regra acusou 7 delas de "parou de entrar" com
      // pedido do dia anterior. O que vale é o dado estar fresco, não o
      // caminho por onde ele chegou.
      const diasSemPedido = pedido
        ? horasEntre(`${pedido}T12:00:00-03:00`, agora) / 24
        : null

      if (diasSemPedido != null && diasSemPedido <= DIAS_IMPORTACAO_MANUAL) {
        gravidade = "ok"
        motivo = "sem API — entra por planilha, e está em dia"
      } else if (diasSemPedido != null) {
        gravidade = "alerta"
        motivo = `sem API e sem dado novo há ${Math.floor(diasSemPedido)} dias (último pedido ${fmt(pedido!)})`
      } else {
        gravidade = "atencao"
        motivo = "plataforma marcada no cadastro, mas nunca recebeu dado"
      }
    } else if (!fin) {
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
        // Passou da folga da planilha (10 dias) → é defeito, não calendário da
        // plataforma. Antes disso fica visível, mas não acorda ninguém.
        gravidade =
          atraso > DIAS_IMPORTACAO_MANUAL * 24 && qtd7d > 0 ? "alerta" : "atencao"
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
      conectada: s.conectada,
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
      // ⚠️ ok/total conta só quem está CONECTADO.
      //
      // Antes o denominador somava as lojas que o cliente marcou no cadastro e
      // nunca ligou: o painel dizia "12/58" na 99 quando existiam 7 conectadas,
      // todas trazendo dado. Vermelho que mistura "nunca ligou" com "parou de
      // funcionar" deixa de significar alguma coisa, e aí ninguém olha.
      total: ls.filter((l) => l.conectada).length,
      ok: ls.filter((l) => l.conectada && l.gravidade === "ok").length,
      alerta: ls.filter((l) => l.conectada && l.gravidade === "alerta").length,
      // Declaradas e nunca ligadas: não são falha, mas são receita potencial
      // parada — e antes não apareciam em lugar nenhum.
      semConexao: ls.filter((l) => !l.conectada).length,
    }
  }

  // ── Fila de conexão do iFood ───────────────────────────────────────────
  // A solicitação é feita À MÃO no Portal do Desenvolvedor, um CNPJ por vez.
  // Numa leva de 14 lojas, uma passar batido é questão de tempo — e aí ela
  // fica em 'solicitada' pra sempre: pro cliente é "ainda não conectou", pra
  // fila é "com o cliente", e ninguém cobra. É o tipo de coisa que só aparece
  // se alguém for olhar; então o relatório vai olhar todo dia.
  const PARADA_DIAS = 3
  const filaIfood: FilaIfood[] = []
  {
    const { data: fila } = await admin
      .from("ifood_activation_requests")
      .select("cnpj, status, updated_at, holdings(name), units(code, name)")
      .in("status", ["pendente", "solicitada"])
    for (const r of (fila ?? []) as unknown as {
      cnpj: string
      status: string
      updated_at: string
      holdings: { name: string } | null
      units: { code: string; name: string } | null
    }[]) {
      const dias = Math.floor(
        (Date.parse(agora) - Date.parse(r.updated_at)) / 86_400_000,
      )
      if (dias < PARADA_DIAS) continue
      filaIfood.push({
        cliente: r.holdings?.name ?? "—",
        loja: r.units
          ? `${r.units.code ? `${r.units.code} · ` : ""}${r.units.name}`
          : "loja sem cadastro",
        cnpj: r.cnpj,
        dias,
        // 'pendente' é a SUA vez: parada aí é fila que você não despachou.
        // 'solicitada' pode ser o cliente demorando pra aprovar — mas passando
        // de uma semana, o mais provável é que a loja nunca tenha aparecido
        // pra ele, e é exatamente esse o caso que some sem avisar.
        gravidade: r.status === "pendente" || dias >= 7 ? "alerta" : "atencao",
        motivo:
          r.status === "pendente"
            ? `Parada há ${dias} dias esperando você solicitar no Portal do Desenvolvedor.`
            : `Solicitada há ${dias} dias e o cliente ainda não aprovou. Confira se ela apareceu no Portal do Parceiro dele — se não apareceu, refaça a solicitação.`,
      })
    }
    filaIfood.sort((a, b) => b.dias - a.dias)
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
    filaIfood,
    crons,
    resumo,
    // "Atenção" não acorda ninguém — só alerta. Loja conectada há 2 horas sem
    // dado é esperado, não é problema.
    tudoCerto:
      resumo.lojasAlerta === 0 &&
      crons.every((c) => c.gravidade !== "alerta") &&
      filaIfood.every((f) => f.gravidade !== "alerta"),
    // Separado de propósito: dizer "tudo certo" com 8 rotinas ainda sem
    // registro é tecnicamente verdade e humanamente mentira. Quem lê vê o
    // selo verde ao lado de "0/8 rodando" e para de confiar no selo.
    temObservacao:
      resumo.lojasAtencao > 0 ||
      crons.some((c) => c.gravidade === "atencao") ||
      filaIfood.some((f) => f.gravidade === "atencao"),
  }
}

function fmt(iso: string): string {
  const d = iso.slice(0, 10).split("-")
  return `${d[2]}/${d[1]}`
}
