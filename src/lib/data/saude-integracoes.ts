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
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"
import { merchantsSumidos } from "@/lib/ifood/merchants-sumidos"
import { idsDeUnidadesDemo } from "@/lib/data/holding-demo"
import { idsDeUnidadesEncerradas } from "@/lib/data/unidades-encerradas"
import { idsDeUnidadesSuspensas } from "@/lib/data/unidades-inativas"

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
/* 72h desde 22/08/26, medido e não chutado.
 *
 * A distribuição real da defasagem entre o último pedido e o último lançamento
 * nas 89 lojas com API: 43 em dia, 24 com 1 dia, 19 com 2 dias, 2 com 3+.
 * Com folga de 48h, as 19 de dois dias caíam no alerta TODO DIA — e dois dias
 * é a cadência normal do extrato do iFood, não defeito. O e-mail saía com 20
 * lojas diariamente, o que ensina a não ler o e-mail.
 *
 * O custo é conhecido e aceito: loja que travar hoje aparece um dia depois. */
const TOLERANCIA_HORAS = 72
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

/** Todas as plataformas vigiadas — com API ou não. */
export type PlataformaSaude = "ifood" | "99food" | "keeta" | "cardapioweb"

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

/**
 * Loja vinculada que o iFood parou de listar.
 *
 * ⚠️ Sumir NÃO prova revogação — ver o cabeçalho de `merchants-sumidos`. O
 * aviso apresenta o FATO e manda conferir a aba Permissões do portal, em vez
 * de acusar o lojista de ter removido o app.
 */
export type LojaSumida = {
  merchantId: string
  nome: string | null
  cnpj: string | null
  desde: string
  unitCode: string
  unitName: string
  empresa: string
  /** Dias sem aparecer na varredura. */
  dias: number
}

export type OportunidadeConexao = {
  cliente: string
  /** Quantas marcações de plataforma sem API, por plataforma. */
  ifood: number
  noveNove: number
  cardapioWeb: number
  total: number
}

export type SaudeIntegracoes = {
  geradoEm: string
  lojas: LojaSaude[]
  lojasSumidas: LojaSumida[]
  filaIfood: FilaIfood[]
  crons: CronSaude[]
  resumo: {
    lojasConectadas: number
    ifood: { total: number; ok: number; alerta: number; semConexao: number }
    noveNove: { total: number; ok: number; alerta: number; semConexao: number }
    keeta: { total: number; ok: number; alerta: number; semConexao: number }
    cardapioWeb: { total: number; ok: number; alerta: number; semConexao: number }
    lojasOk: number
    lojasAtencao: number
    lojasAlerta: number
    cronsOk: number
    cronsProblema: number
  }
  /**
   * Lojas que vendem na plataforma e AINDA NÃO conectaram a nossa API.
   *
   * Fica fora da saúde de propósito (Marcus, 19/08/26): não é falha nossa nem
   * do cliente — é oportunidade. Misturado ao alerta, virava ruído; separado,
   * é a lista de quem ligar pra tirar do trabalho manual.
   */
  oportunidades: OportunidadeConexao[]
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
  // A DEMO NÃO É CLIENTE — fora de qualquer relatório interno.
  //
  // As lojas dela são marcadas como conectadas por API de propósito (é o que o
  // cliente precisa ver na apresentação), e por isso entravam aqui como se
  // fossem operação real: apareciam nos "86/86 iFood" e enchiam a seção de
  // rotinas com 10 lojas "que nunca fecharam o extrato" — sendo que elas nem
  // sincronizam. Relatório de saúde com loja fictícia dentro é relatório que
  // ninguém consegue usar pra decidir nada.
  //
  // Cliente ENCERRADO sai pelo mesmo motivo, com uma razão a mais: o sync dele
  // foi desligado de propósito (ver unidades-encerradas.ts), então ele ficaria
  // eternamente na lista de "parou de mandar dado" — acusando como falha
  // justamente o que a gente decidiu que devia acontecer. Suspenso por
  // cobrança NÃO sai: ali o silêncio ainda é informação, o cliente pode voltar.
  /* Carimbo de leitura do extrato — ver ifood_extrato_lido.
   *
   * ── POR QUE (Marcus, 22/08/26) ─────────────────────────────────────────
   * Este diagnóstico deduzia o estado pela AUSÊNCIA do dado, e com isso dava o
   * mesmo alarme para duas coisas opostas: "não conseguimos ler o extrato" e
   * "lemos, e a loja não vendeu". Das 6 lojas que apareciam atrasadas em
   * 22/08, cinco simplesmente não tinham vendido — a Chapa Quente estava sem
   * pedido desde 17/jul. Alarme que não distingue defeito de fato do negócio
   * ensina a ignorar alarme.
   *
   * Só a competência CORRENTE interessa: é ela que responde "o caminho está
   * funcionando hoje?". */
  const compAtual = agora.slice(0, 7)
  const desde30h = new Date(Date.now() - 30 * 3600_000).toISOString()
  const [demo, encerradas, suspensas, extratos, importados] = await Promise.all([
    idsDeUnidadesDemo(),
    idsDeUnidadesEncerradas(),
    /**
     * ⚠️ CLIENTE SUSPENSO SAI DO RELATÓRIO (Marcus, 25/08/26).
     *
     * O sync já parava de puxar dado dele. O relatório é que continuava
     * cobrando: o e-mail de 25/08 abria com "Vbfood · Pizzaria Quero Mais
     * sumiu da lista do iFood — confira o CNPJ na aba Permissões", pedindo
     * providência sobre a loja de um cliente que tinha saído três dias antes.
     *
     * Isso é pior que ruído: manda alguém trabalhar à toa, e enterra o
     * alerta de quem está pagando no meio do de quem não está.
     */
    idsDeUnidadesSuspensas(),
    admin
      .from("ifood_extrato_lido")
      .select("unit_id, lido_em, linhas")
      .eq("competencia", compAtual),
    /* A OUTRA METADE DA PROVA.
     *
     * `ifood_extrato_lido` nasceu pro caso que não deixava rastro nenhum: o
     * extrato lido e VAZIO. Mas o extrato lido COM linhas sempre deixou —
     * `platform_imports` guarda cada carga bem-sucedida, e é dela que o
     * coletor já se serve pra saber o que não precisa buscar de novo.
     *
     * Usar as duas evita esperar a tabela nova encher pra responder uma
     * pergunta que o banco já sabia responder. */
    admin
      .from("platform_imports")
      .select("unit_id, imported_at")
      .eq("platform", "ifood")
      .eq("report_type", "financeiro")
      .eq("status", "success")
      .gte("imported_at", desde30h),
  ])
  const extratoLido = new Map<string, { lidoEm: string; linhas: number }>()
  for (const e of (extratos.data ?? []) as {
    unit_id: string
    lido_em: string
    linhas: number
  }[]) {
    extratoLido.set(e.unit_id, { lidoEm: e.lido_em, linhas: e.linhas })
  }
  // Carga bem-sucedida é leitura provada. Fica com a data MAIS RECENTE entre
  // as duas fontes — elas dizem a mesma coisa por caminhos diferentes.
  for (const i of (importados.data ?? []) as {
    unit_id: string
    imported_at: string
  }[]) {
    const atual = extratoLido.get(i.unit_id)
    if (!atual || i.imported_at > atual.lidoEm) {
      extratoLido.set(i.unit_id, { lidoEm: i.imported_at, linhas: 1 })
    }
  }
  /**
   * ⚠️ SÓ LOJA COM API VINCULADA. (Marcus, 19/08/26)
   *
   * "Esse e-mail tem que ser correspondente apenas às lojas que têm API
   * vinculada. As outras não dependem do nosso trabalho — não preciso saber se
   * a pessoa importou ou não planilha."
   *
   * A regra antiga media o DADO, não o caminho: loja sem API que ficasse dias
   * sem planilha virava "alerta". Só que planilha é tarefa do cliente, e o
   * relatório existe pra dizer o que a NOSSA operação precisa consertar. Com
   * 78 lojas de iFood no placar e 60 em dia, as 18 restantes eram, na maioria,
   * gente que simplesmente não subiu arquivo — ruído que faz parar de ler o
   * alerta que importa.
   *
   * Efeito colateral esperado e correto: a Keeta some do relatório inteiro.
   * Ela não tem API, então nenhuma loja dela jamais dependeu de nós.
   */
  const linhas = ((sinais ?? []) as Sinal[]).filter(
    (s) =>
      s.conectada &&
      !demo.has(s.unit_id) &&
      !encerradas.has(s.unit_id) &&
      !suspensas.has(s.unit_id),
  )

  /**
   * Quem ainda não conectou — por cliente, e só das plataformas que TÊM API.
   *
   * A Keeta fica de fora porque não existe API dela: listar as lojas dela como
   * "oportunidade" seria oferecer o que não temos pra vender.
   *
   * Sai dos sinais CRUS (antes do filtro de conectada), que é justamente o
   * conjunto que a saúde deixou de olhar.
   */
  const semApi = ((sinais ?? []) as Sinal[]).filter(
    (s) =>
      !s.conectada &&
      s.plataforma !== "keeta" &&
      !demo.has(s.unit_id) &&
      !encerradas.has(s.unit_id) &&
      // Não faz sentido oferecer conexão pra quem saiu da carteira.
      !suspensas.has(s.unit_id),
  )

  const unitIds = [
    ...new Set([...linhas, ...semApi].map((s) => s.unit_id)),
  ]
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

  /* ⚠️ FORA DO SYNC NÃO ENTRA NO RELATÓRIO DE SAÚDE.
   *
   * Cliente suspenso e conta demo saem de todos os syncs, e mesmo assim
   * entravam nos contadores daqui — inflando o denominador do "88/91" e
   * cobrando extrato de loja que ninguém foi buscar. A regra vivia num
   * módulo só (`unidades-inativas`) pra não divergir; este coletor era a
   * cópia que nunca a recebeu. */
  const fora = await idsDeUnidadesForaDoSync()

  const porCliente = new Map<string, OportunidadeConexao>()
  for (const s of semApi) {
    const info = unitInfo.get(s.unit_id)
    if (!info || !info.ativa || fora.has(s.unit_id)) continue
    const atual =
      porCliente.get(info.cliente) ??
      { cliente: info.cliente, ifood: 0, noveNove: 0, cardapioWeb: 0, total: 0 }
    if (s.plataforma === "ifood") atual.ifood += 1
    else if (s.plataforma === "99food") atual.noveNove += 1
    else if (s.plataforma === "cardapioweb") atual.cardapioWeb += 1
    atual.total += 1
    porCliente.set(info.cliente, atual)
  }
  // Maior primeiro: quem tem 12 lojas soltas rende mais que quem tem 1.
  const oportunidades = [...porCliente.values()].sort(
    (a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, "pt-BR"),
  )

  const lojas: LojaSaude[] = []
  for (const s of linhas) {
    const info = unitInfo.get(s.unit_id)
    if (!info || !info.ativa || fora.has(s.unit_id)) continue

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
      } else if (lidoRecentemente(extratoLido.get(s.unit_id)?.lidoEm, agora)) {
        // Lemos o extrato e ele veio vazio: a conexão funciona, a loja é que
        // não vendeu nada ainda. Conversa comercial, não conserto técnico.
        gravidade = "atencao"
        motivo = `conectada há ${Math.floor(horasLigada / 24)} dias; o extrato é lido normalmente, mas ainda não houve venda`
      } else {
        gravidade = "alerta"
        motivo = `conectada há ${Math.floor(horasLigada / 24)} dias e nunca trouxe dado`
      }
    } else if (
      /* O extrato do mês foi lido há pouco: o caminho está de pé, e o que
       * falta depois da última data é ausência de VENDA, não de sincronização.
       * Antes desta linha as duas coisas produziam o mesmo alerta. */
      s.plataforma === "ifood" &&
      lidoRecentemente(extratoLido.get(s.unit_id)?.lidoEm, agora) &&
      qtd7d === 0
    ) {
      gravidade = "ok"
      motivo = `extrato lido ${quando(extratoLido.get(s.unit_id)!.lidoEm, agora)}; a loja não vendeu no período`
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
    // Entraram em 15/08/26 e não são coadjuvantes: o COLETOR é quem faz o
    // financeiro do dia entrar (o sync só PEDE o extrato, que o iFood gera de
    // forma assíncrona e pode levar horas), e o BACKFILL é quem traz o
    // histórico de loja nova. Se qualquer um parar, o cliente vê número
    // velho — e sem estarem nesta lista, ninguém ficaria sabendo.
    "ifood-coletor",
    "ifood-backfill",
    "ninefood-sync",
    "cardapioweb-sync",
    "process-99-webhooks",
    "billing-vencimentos",
    "emitir-faturas",
    "regua-email",
  ]
  /**
   * ⚠️ UMA CONSULTA POR CRON, e não "as N linhas mais recentes".
   *
   * Era `.limit(400)` sobre a tabela inteira ordenada por data. Isso funciona
   * enquanto todos os crons têm cadência parecida — e quebrou no dia em que
   * dois crons de minuto entraram no ar (15/08/26: coletor a cada 4 min,
   * backfill a cada 5). Eles sozinhos ocuparam 398 das 400 linhas, os crons
   * DIÁRIOS caíram fora da janela, e o relatório de saúde anunciou SETE
   * rotinas "nunca registrou execução — está parado" com todas rodando
   * normalmente.
   *
   * Limite por contagem é uma aposta na cadência de quem escreve. Perguntar
   * "qual foi a última execução DESTE cron" não tem esse problema, e são 9
   * consultas de uma linha cada, servidas pelo índice.
   */
  const ultimoPorCron = new Map<string, Record<string, unknown>>()
  const ultimos = await Promise.all(
    ESPERADOS.map((nome) =>
      admin
        .from("cron_runs")
        .select("nome, iniciado_em, ok, duracao_ms, erro")
        .eq("nome", nome)
        .order("iniciado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  )
  for (const { data: r } of ultimos) {
    if (r) ultimoPorCron.set(String(r.nome), r as Record<string, unknown>)
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
      // "Monitorada" = entra por API OU está trazendo dado por planilha. O que
      // fica de fora é só quem nunca trouxe nada — que não é falha, é
      // integração que ninguém acionou. A Keeta obrigou essa distinção: ela
      // não tem API nenhuma e mesmo assim é 55% das taxas da rede.
      total: ls.filter((l) => l.conectada || l.ultimoPedido).length,
      ok: ls.filter((l) => (l.conectada || l.ultimoPedido) && l.gravidade === "ok").length,
      alerta: ls.filter((l) => (l.conectada || l.ultimoPedido) && l.gravidade === "alerta").length,
      // Declaradas e nunca ligadas: não são falha, mas são receita potencial
      // parada — e antes não apareciam em lugar nenhum.
      semConexao: ls.filter((l) => !l.conectada && !l.ultimoPedido).length,
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
    keeta: porPlataforma("keeta"),
    cardapioWeb: porPlataforma("cardapioweb"),
    lojasOk: lojas.filter((l) => l.gravidade === "ok").length,
    lojasAtencao: lojas.filter((l) => l.gravidade === "atencao").length,
    lojasAlerta: lojas.filter((l) => l.gravidade === "alerta").length,
    cronsOk: crons.filter((c) => c.gravidade === "ok").length,
    cronsProblema: crons.filter((c) => c.gravidade !== "ok").length,
  }

  /**
   * Loja vinculada que sumiu da lista do iFood.
   *
   * ── POR QUE ISSO PRECISAVA ESTAR AQUI (18/08/26) ────────────────────────
   * A Pizzaria Quero Mais (Vbfood) sumiu em 14/08 e o financeiro dela parou no
   * mesmo dia. Ninguém soube: o cliente seguiu vendo os números de 13/08 como
   * se fossem os de hoje, e o sync seguiu pedindo extrato pra uma loja que o
   * iFood não lista mais. A detecção já existia em `merchants-sumidos`; o que
   * faltava era ela chegar em alguém.
   *
   * É sempre ALERTA, nunca "atenção": loja que para de dar dado é o tipo de
   * silêncio que só piora com o tempo.
   */
  const lojasSumidas: LojaSumida[] = (await merchantsSumidos())
    .filter((m) => m.loja !== null)
    /**
     * ⚠️ CLIENTE SUSPENSO NÃO ENTRA — e este era o pior caso de todos.
     *
     * O e-mail de 25/08 abria com "Vbfood · Pizzaria Quero Mais sumiu da lista
     * do iFood · confira o CNPJ 34717646000106 na aba Permissões do Portal do
     * Parceiro". Uma providência concreta, no topo do relatório, sobre a loja
     * de um cliente que tinha saído da carteira três dias antes.
     *
     * O filtro dos outros blocos ficava lá em cima (nos `sinais`); este vem de
     * outra fonte (`merchants-sumidos`) e passava por fora. Toda lista nova do
     * relatório precisa lembrar da régua — é o custo de a régua ser aplicada
     * lista a lista em vez de na saída.
     */
    .filter((m) => !suspensas.has(m.loja!.unitId))
    .map((m) => ({
      merchantId: m.merchantId,
      nome: m.nome,
      cnpj: m.cnpj,
      desde: m.desde,
      unitCode: m.loja!.code,
      unitName: m.loja!.name,
      empresa: m.loja!.empresa,
      dias: Math.max(
        0,
        Math.floor(
          (Date.parse(agora) - Date.parse(m.desde)) / 86_400_000,
        ),
      ),
    }))

  return {
    geradoEm: agora,
    lojas,
    lojasSumidas,
    filaIfood,
    crons,
    oportunidades,
    resumo,
    // "Atenção" não acorda ninguém — só alerta. Loja conectada há 2 horas sem
    // dado é esperado, não é problema.
    tudoCerto:
      lojasSumidas.length === 0 &&
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

/** Leitura de até 30h atrás ainda prova que o caminho está de pé (o cron é diário). */
function lidoRecentemente(lidoEm: string | undefined, agora: string): boolean {
  if (!lidoEm) return false
  return horasEntre(lidoEm, agora) <= 30
}

function quando(lidoEm: string, agora: string): string {
  const h = horasEntre(lidoEm, agora)
  if (h < 1) return "há minutos"
  if (h < 24) return `há ${Math.floor(h)}h`
  return `há ${Math.floor(h / 24)} dia(s)`
}
