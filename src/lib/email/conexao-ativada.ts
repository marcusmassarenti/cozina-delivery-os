import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fmtBRL } from "@/lib/format"

/**
 * "Conectado — olha o que já entrou." Um e-mail, uma vez, por loja × plataforma.
 *
 * POR QUE EXISTE: aprovar a conexão é um ato de fé. A pessoa autoriza no
 * portal da plataforma e volta pro seu dia sem nenhuma confirmação de que
 * funcionou — e o primeiro dado só aparece na madrugada seguinte. Este e-mail
 * fecha o ciclo com número, não com "tudo certo!": mostra o que entrou, de
 * quando até quando, e o que ainda falta.
 *
 * SERVE AS TRÊS PLATAFORMAS de propósito. A pergunta do cliente é a mesma em
 * todas — "funcionou? o que veio?" — e o que muda é só a lista de números. O
 * aviso interno de conexão já tinha passado por isso: o segundo ia copiar 60
 * linhas de HTML do primeiro, e neste projeto regra duplicada já divergiu na
 * prática.
 *
 * ⚠️ DEPOIS DESTE, NENHUM OUTRO. O cliente volta a receber só o aviso semanal
 * de saúde. E-mail de integração que continua chegando vira ruído, e ruído faz
 * parar de ler justamente o aviso que importa.
 */

export type PlataformaConexao = "ifood" | "99food" | "cardapioweb"

const ROTULO: Record<PlataformaConexao, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  cardapioweb: "Cardápio Web",
}

/** Uma linha do resumo: "Pedidos" → "312". */
type Linha = { rotulo: string; valor: string }

type Resumo = {
  linhas: Linha[]
  /** O que ainda falta o CLIENTE fazer. Vazio = está tudo de pé. */
  pendencias: string[]
  /**
   * O que falta a NÓS buscar — ele não tem nada a fazer, só esperar.
   *
   * São coisas diferentes e misturá-las custou caro. "Autorizado" e "o dado
   * chegou" não são o mesmo estado: as avaliações do iFood vêm num cron
   * separado, então dá pra estar tudo autorizado e a tela de Avaliações
   * continuar vazia por algumas horas. O e-mail lia só a autorização, dizia
   * "você não precisa fazer mais nada" e ainda fechava com "esse é o último
   * e-mail sobre a conexão" — o cliente abria as Avaliações, via zero, e a
   * leitura óbvia era defeito. Aconteceu com a Tech Assessoria em 13/ago/26.
   *
   * Separado de `pendencias` de propósito: pendência pede ação e vai em caixa
   * de alerta; isto é informação e vai em tom neutro. Tratar espera normal
   * como problema treina a pessoa a ignorar os avisos de verdade.
   */
  aCaminho: string[]
  /** false = não achei dado nenhum; o e-mail não sai. */
  temDado: boolean
}

function periodo(de: string | null, ate: string | null): string | null {
  if (!de || !ate) return null
  const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
  return de.slice(0, 10) === ate.slice(0, 10)
    ? f(de)
    : `${f(de)} a ${f(ate)}`
}

/**
 * O que a plataforma trouxe pra esta loja.
 *
 * Consultas pequenas e diretas em vez do agregador mensal: aqui a pergunta é
 * "o que existe, no total", não "quanto foi em agosto" — e o histórico
 * importado costuma cobrir meses, que é justamente a boa notícia a dar.
 */
export async function resumoDaLoja(
  unitId: string,
  plataforma: PlataformaConexao,
): Promise<Resumo> {
  const admin = createAdminClient()
  const linhas: Linha[] = []
  const pendencias: string[] = []
  const aCaminho: string[] = []

  if (plataforma === "ifood") {
    /* ⚠️ ESTE BLOCO JÁ MENTIU. A versão anterior chamava um RPC que somava só
     * `impacto_no_repasse` — ou seja, o REPASSE — e mandava com o rótulo
     * "Faturamento". Na Jardins, isso era R$ 442 mil no lugar de R$ 844 mil.
     *
     * Agora sai da mesma fonte da tela: resumo financeiro + cesta dos
     * cancelados. Se a régua do bruto mudar, muda nos dois juntos. */
    const { resumoDoAnoIfood } = await import("@/lib/email/resumo-da-loja")
    const r = await resumoDoAnoIfood(unitId)
    linhas.push(...r.linhas)

    const { data: plat } = await admin
      .from("unit_platforms")
      .select("fin_enabled_at, review_enabled_at")
      .eq("unit_id", unitId)
      .eq("platform", "ifood")
      .maybeSingle()

    const [aval] = await Promise.all([
      admin
        .from("ifood_avaliacoes")
        .select("nota")
        .eq("unit_id", unitId)
        .not("nota", "is", null),
    ])
    const notas = (aval.data ?? []) as { nota: number }[]
    if (notas.length > 0) {
      const media = notas.reduce((s, n) => s + Number(n.nota), 0) / notas.length
      linhas.push({
        rotulo: "Avaliações",
        valor: `${notas.length} · nota ${media.toFixed(1).replace(".", ",")}`,
      })
    }

    const p = plat as
      | { fin_enabled_at: string | null; review_enabled_at: string | null }
      | null
    if (p && !p.fin_enabled_at)
      pendencias.push(
        "O app de Financeiro ainda não foi autorizado — o extrato não entra até isso acontecer.",
      )
    if (p && !p.review_enabled_at)
      pendencias.push(
        "O app de Avaliações ainda não foi autorizado — as notas e comentários não entram até isso acontecer.",
      )

    // Autorizado MAS ainda sem nenhuma avaliação = só falta o cron passar.
    // Sem esta linha o e-mail afirmava "não precisa fazer mais nada" com a
    // tela de Avaliações zerada, e ainda se despedia dizendo que não haveria
    // outro aviso.
    if (p?.review_enabled_at) {
      const { count } = await admin
        .from("ifood_avaliacoes")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", unitId)
      if ((count ?? 0) === 0) {
        aCaminho.push(
          "As <strong>avaliações</strong> entram na próxima sincronização, amanhã de manhã — a autorização já está de pé, é só o histórico de notas e comentários que ainda está sendo baixado.",
        )
      }
    }
  }

  if (plataforma === "99food") {
    /**
     * ⚠️ O 99 TEM DUAS FONTES, e este e-mail lia só uma.
     *
     * `ninefood_daily_loja` é o agregado da PLANILHA. Loja conectada por API
     * grava em `ninefood_api_bill` e nunca escreve ali — então a CR Poços,
     * conectada em 18/08/26, tinha 2 meses de extrato no banco e o e-mail
     * enxergava zero: a varredura devolvia o carimbo e o cliente nunca seria
     * avisado de que o 99 está conectado. Silenciosamente, porque tabela vazia
     * não avisa que está vazia.
     *
     * (Este é o segundo erro na MESMA função pelo mesmo motivo — antes era a
     * coluna `faturamento_bruto`, que nunca existiu. Ler a fonte errada falha
     * calado nas duas vezes.)
     *
     * A API vem primeiro: quando existe extrato, ele é a fonte da tela. A
     * planilha fica de reserva pra quem ainda não conectou.
     */
    const { data: links } = await admin
      .from("ninefood_store_links")
      .select("app_shop_id")
      .eq("unit_id", unitId)
      .eq("active", true)
    const shops = ((links ?? []) as { app_shop_id: string }[]).map(
      (l) => l.app_shop_id,
    )

    let bruto = 0
    let pedidos = 0
    let de: string | null = null
    let ate: string | null = null

    if (shops.length > 0) {
      const { data: bill } = await admin
        .from("ninefood_api_bill")
        .select("order_id, meal_original_amount, business_date")
        .in("app_shop_id", shops)
        .order("business_date")
      const rows = (bill ?? []) as {
        order_id: string | null
        meal_original_amount: number | null
        business_date: string | null
      }[]
      // Mesma regra do painel: um pedido conta uma vez, mesmo com várias
      // linhas de extrato (reembolso, pós-venda, taxa).
      const vistos = new Set<string>()
      for (const r of rows) {
        if (r.order_id) {
          if (vistos.has(r.order_id)) continue
          vistos.add(r.order_id)
        }
        pedidos += 1
        bruto += Number(r.meal_original_amount ?? 0)
        if (r.business_date) {
          if (!de || r.business_date < de) de = r.business_date
          if (!ate || r.business_date > ate) ate = r.business_date
        }
      }
    }

    if (pedidos === 0) {
      const { data } = await admin
        .from("ninefood_daily_loja")
        // ⚠️ Era `faturamento_bruto`, coluna que NUNCA existiu nesta tabela: o
        // select falhava calado e o e-mail da 99 saía sem número nenhum desde
        // sempre. O nome certo é `bruto`.
        .select("data, bruto, pedidos")
        .eq("unit_id", unitId)
        .order("data")
      const rows = (data ?? []) as {
        data: string
        bruto: number | null
        pedidos: number | null
      }[]
      if (rows.length) {
        bruto = rows.reduce((s, r) => s + Number(r.bruto ?? 0), 0)
        pedidos = rows.reduce((s, r) => s + Number(r.pedidos ?? 0), 0)
        de = String(rows[0]!.data)
        ate = String(rows[rows.length - 1]!.data)
      }
    }

    if (pedidos > 0 || bruto > 0) {
      if (bruto) linhas.push({ rotulo: "Faturamento", valor: fmtBRL(bruto) })
      const p = de && ate ? periodo(de, ate) : null
      if (p) linhas.push({ rotulo: "Período", valor: p })
      if (pedidos) linhas.push({ rotulo: "Pedidos", valor: String(pedidos) })
    }
  }

  if (plataforma === "cardapioweb") {
    const { data } = await admin
      .from("cardapioweb_pedidos")
      .select("criado_em, total, status")
      .eq("unit_id", unitId)
      .order("criado_em")
    const rows = data ?? []
    // Cancelado não é venda: entrar no "olha quanto você faturou" seria a
    // primeira impressão errada, e o número não bateria com o painel.
    const validos = rows.filter((r) => r.status !== "canceled")
    if (validos.length) {
      const bruto = validos.reduce((s, r) => s + Number(r.total ?? 0), 0)
      if (bruto) linhas.push({ rotulo: "Faturamento", valor: fmtBRL(bruto) })
      const p = periodo(
        String(rows[0]!.criado_em),
        String(rows[rows.length - 1]!.criado_em),
      )
      if (p) linhas.push({ rotulo: "Período", valor: p })
      linhas.push({ rotulo: "Pedidos", valor: String(validos.length) })
    }
  }

  return { linhas, pendencias, aCaminho, temDado: linhas.length > 0 }
}

/**
 * O HISTÓRICO JÁ FECHOU? Enquanto não fechou, este e-mail não sai.
 *
 * ── NASCEU DE UM ERRO, EM 18/08/26 ───────────────────────────────────────
 * A CR Poços recebeu "Pronto: o iFood está conectado" com R$ 22.225,18, fev a
 * ago/26, 337 pedidos. Poucas horas depois o backfill fechou e o número real
 * era R$ 69.353,77, jan a ago/26, 1.247 pedidos. O e-mail não estava errado no
 * momento em que saiu — ele fotografou o meio da carga e apresentou como o ano
 * inteiro. E como sai UMA VEZ SÓ, não existe segunda mensagem pra corrigir: o
 * cliente fica com a impressão de que a rede dele fatura um terço do que fatura.
 *
 * A regra, então: número que apresenta o histórico só pode sair depois que o
 * histórico existe. Esperar algumas horas custa muito menos que mentir uma vez.
 *
 * ── O SINAL É DIFERENTE EM CADA PLATAFORMA ───────────────────────────────
 *  • iFood — `unit_platforms.historico_backfill_at`, carimbado por
 *    `backfillPendentes` quando TODOS os meses chegaram (o extrato é
 *    assíncrono; mês faltando não avisa que falta).
 *  • Cardápio Web — `cardapioweb_sync_state.backfill_concluido`. O histórico
 *    vem em janelas de 30 dias por rodada, então leva algumas noites.
 *  • 99 Food — `ninefood_store_links.historico_backfill_at`, carimbado pelo
 *    cron do 99 depois de puxar do limite mais antigo da API até hoje.
 *
 * Loja sem nenhum vínculo na plataforma devolve `false`: sem vínculo não há
 * backfill pra fechar, e sem backfill não há e-mail.
 */
async function historicoFechado(
  admin: ReturnType<typeof createAdminClient>,
  unitId: string,
  plataforma: PlataformaConexao,
): Promise<boolean> {
  if (plataforma === "ifood") {
    const { data } = await admin
      .from("unit_platforms")
      .select("historico_backfill_at")
      .eq("unit_id", unitId)
      .eq("platform", "ifood")
      .maybeSingle()
    return Boolean(data?.historico_backfill_at)
  }

  if (plataforma === "99food") {
    const { data } = await admin
      .from("ninefood_store_links")
      .select("historico_backfill_at")
      .eq("unit_id", unitId)
      .eq("active", true)
    const links = (data ?? []) as { historico_backfill_at: string | null }[]
    // Uma unidade pode ter mais de um app_shop_id. Fechou = todos fecharam.
    return links.length > 0 && links.every((l) => l.historico_backfill_at)
  }

  const { data: inst } = await admin
    .from("cardapioweb_installs")
    .select("id")
    .eq("unit_id", unitId)
    .eq("active", true)
  const ids = ((inst ?? []) as { id: string }[]).map((i) => i.id)
  if (ids.length === 0) return false

  const { data: est } = await admin
    .from("cardapioweb_sync_state")
    .select("install_id")
    .in("install_id", ids)
    .eq("backfill_concluido", true)
  // Instalação sem linha de estado é instalação que nunca sincronizou: conta
  // como não-fechada, e é por isso que a comparação é por quantidade.
  return ((est ?? []) as unknown[]).length === ids.length
}

/**
 * Avisa o cliente, uma vez, que a plataforma está conectada e trazendo dado.
 *
 * NUNCA LANÇA: isto roda dentro do sync. Falhar o e-mail não pode derrubar a
 * sincronização nem fazer o cron parecer quebrado — o dado já entrou, que é o
 * que importa.
 */
export async function avisarConexaoAtivada(
  unitId: string,
  plataforma: PlataformaConexao,
  opts: { soSeCompleto?: boolean } = {},
): Promise<void> {
  try {
    const admin = createAdminClient()

    // `soSeCompleto` existe pro aviso IMEDIATO, logo depois do backfill.
    //
    // O e-mail sai uma vez só, então mandá-lo cedo demais custa caro: quem
    // autorizou os DOIS apps do iFood receberia "as avaliações ainda não estão
    // entrando" só porque o cron delas roda uma hora depois do financeiro — um
    // pedido de providência para quem já fez tudo certo. Não haveria segunda
    // mensagem pra desmentir.
    //
    // `pendencias` vazio é exatamente "veio inteiro", e é a mesma conta que o
    // corpo do e-mail usa. Quem tem pendência não perde o aviso: cai na
    // varredura das 7h, quando as duas pontas já rodaram e a frase é verdade.
    //
    // Custa uma leitura a mais, e ela é de propósito: conferir ANTES de
    // carimbar evita marcar como avisada uma loja que não vai receber nada.
    if (opts.soSeCompleto) {
      const previa = await resumoDaLoja(unitId, plataforma)
      if (!previa.temDado || previa.pendencias.length > 0) return
    }

    // O portão do histórico, e ele NÃO é opcional.
    //
    // De propósito não virou `opts`: todo caller quer o mesmo — mandar quando
    // o número for verdadeiro. Deixar como flag é convidar o próximo caller a
    // esquecer, e o custo do esquecimento é o e-mail com um terço da receita.
    // Quem chega cedo não perde nada: continua sem carimbo e cai na varredura
    // seguinte da própria plataforma, já com o histórico inteiro.
    if (!(await historicoFechado(admin, unitId, plataforma))) return

    // Carimba ANTES de enviar, e só segue se a marcação for minha.
    //
    // O sync roda em paralelo por loja e pode ser disparado à mão logo depois
    // do cron: sem isto, duas execuções simultâneas leriam "null" e mandariam
    // dois e-mails. `.is("email_conectado_at", null)` no update faz o banco
    // decidir quem chegou primeiro -- quem não voltar com linha, desiste.
    //
    // O custo é o caso raro do envio falhar depois do carimbo: aí o cliente
    // não recebe. É o lado certo de errar — melhor um aviso a menos que o
    // mesmo aviso duas vezes.
    const { data: marcou } = await admin
      .from("unit_platforms")
      .update({ email_conectado_at: new Date().toISOString() })
      .eq("unit_id", unitId)
      .eq("platform", plataforma)
      .is("email_conectado_at", null)
      .select("unit_id")
    if (!marcou || marcou.length === 0) return

    const resumo = await resumoDaLoja(unitId, plataforma)
    // Conectou mas não veio nada: o e-mail seria uma tabela vazia dizendo
    // "pronto!". Devolve o carimbo pra tentar de novo no próximo sync.
    if (!resumo.temDado) {
      await admin
        .from("unit_platforms")
        .update({ email_conectado_at: null })
        .eq("unit_id", unitId)
        .eq("platform", plataforma)
      return
    }

    const { data: unidade } = await admin
      .from("units")
      .select("name, brand_id, brands(holding_id)")
      .eq("id", unitId)
      .maybeSingle()
    const holdingId = (unidade?.brands as { holding_id?: string } | null)
      ?.holding_id
    if (!holdingId) return

    const { contatoDaHolding } = await import("@/lib/email/contato-holding")
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { conexaoAtivada } = await import("@/lib/email/templates")

    const contato = await contatoDaHolding(holdingId)
    if (!contato) return

    const { assunto, html } = conexaoAtivada({
      nome: contato.nome,
      loja: (unidade?.name as string | null) ?? null,
      plataforma: ROTULO[plataforma],
      linhas: resumo.linhas,
      pendencias: resumo.pendencias,
      aCaminho: resumo.aCaminho,
    })
    await enviarEmail({
      holdingId,
      tipo: "conexao-ativada",
      para: contato.email,
      assunto,
      html,
      // Uma loja × plataforma por vez: o carimbo acima já garante o "uma
      // vez", mas um cliente com 16 lojas conectando no mesmo dia dispararia
      // 16 e-mails legítimos que a trava de duplicidade engoliria.
      forcar: true,
    })
  } catch (e) {
    console.error("avisarConexaoAtivada", unitId, plataforma, e)
  }
}

/**
 * Varre as conexões que ainda não receberam o e-mail e manda o que estiver de pé.
 *
 * ⚠️ RODA UMA VEZ SÓ, ÀS 7h, e não dentro de cada sync. O motivo é o iFood: o
 * financeiro entra às 6h e as avaliações às 7h. Disparar no sync do financeiro
 * faria o e-mail dizer "as avaliações ainda não estão entrando — falta
 * autorizar o segundo app" para quem autorizou os dois certinho. Às 7h os três
 * crons já passaram (99 às 5h, iFood às 6h, Cardápio Web às 6h05), então o
 * retrato é o verdadeiro.
 *
 * O efeito colateral é bom: quem conecta às 10h da manhã recebe o e-mail na
 * manhã seguinte, já com o histórico inteiro em vez de um punhado de horas.
 *
 * Loja que conectou mas ainda não trouxe nada não recebe nada e continua na
 * fila -- `avisarConexaoAtivada` devolve o carimbo quando não acha dado.
 */
export async function varrerConexoesNovas(
  opts: { apenas?: PlataformaConexao } = {},
): Promise<{
  avaliadas: number
  enviados: number
}> {
  const admin = createAdminClient()
  /**
   * `apenas` existe pra varrer no fim do cron da própria plataforma.
   *
   * A janela das 7h resolve o problema do iFood (financeiro 6h, avaliações
   * 7h), mas prendia as outras duas a ela: loja do 99 cujo histórico fecha às
   * 5h05 esperaria mais 26 horas por um e-mail que já era verdade. Filtrando
   * pela plataforma, cada cron avisa o seu logo depois de fechar o histórico —
   * e o iFood continua saindo só às 7h, quando as duas pontas já rodaram.
   */
  const { data } = await admin
    .from("unit_platforms")
    .select("unit_id, platform, api_store_id")
    .is("email_conectado_at", null)
    .eq("active", true)
    .in(
      "platform",
      opts.apenas ? [opts.apenas] : ["ifood", "99food", "cardapioweb"],
    )

  const candidatos = (data ?? []) as {
    unit_id: string
    platform: PlataformaConexao
    api_store_id: string | null
  }[]

  // ⚠️ SÓ CONEXÃO DE API DE VERDADE.
  //
  // `unit_platforms` diz que a loja VENDE naquela plataforma — não que ela
  // esteja conectada. A maioria das lojas está lá porque alguém marcou o
  // canal no cadastro e o dado entra por planilha.
  //
  // Errei exatamente isso em 09/08/26: a varredura mandou "o iFood está
  // conectado, já está trazendo os dados sozinho" pra 3 clientes cujas lojas
  // nunca tiveram API — os números eram reais (vinham de importação), a frase
  // é que era falsa. E restavam 62 na fila pra repetir no dia seguinte.
  //
  // O sinal de conexão é diferente em cada plataforma, e é por isso que o
  // guarda da migration falhou: ele usou `api_store_id`, que só o iFood tem.
  const [links99, installsCw] = await Promise.all([
    admin.from("ninefood_store_links").select("unit_id"),
    admin.from("cardapioweb_installs").select("unit_id").eq("active", true),
  ])
  const com99 = new Set(
    (links99.data ?? []).map((l) => l.unit_id as string).filter(Boolean),
  )
  const comCw = new Set(
    (installsCw.data ?? []).map((i) => i.unit_id as string).filter(Boolean),
  )

  /**
   * ⚠️ VÍNCULO NÃO É PROVA DE QUE A API FUNCIONA.
   *
   * O guarda acima já tinha falhado uma vez (09/08/26) usando só o cadastro,
   * e falhou DE NOVO em 14/08/26 usando só o vínculo: o Marmitex Faisão tinha
   * `api_store_id` preenchido e 4.536 lançamentos, e mesmo assim a API do
   * iFood respondia 403 pra ele. Os lançamentos tinham vindo de PLANILHA. O
   * cliente recebeu "iFood conectado" de uma loja que não estava conectada.
   *
   * A única prova que resta de pé é o dado ter chegado PELA API. É isso que
   * `platform_imports.source = 'api'` registra, e é por isso que ele entra
   * aqui: vínculo diz que apontamos pra uma loja; `source='api'` diz que ela
   * respondeu.
   */
  const { data: cargasApi } = await admin
    .from("platform_imports")
    .select("unit_id, platform")
    .eq("source", "api")
    .in(
      "unit_id",
      candidatos.map((c) => c.unit_id),
    )
  const jaVeioPelaApi = new Set(
    ((cargasApi ?? []) as { unit_id: string; platform: string }[]).map(
      (r) => `${r.unit_id}|${r.platform}`,
    ),
  )

  /** Aponta pra uma loja de API. Diz o que a gente configurou, não o que funciona. */
  const temVinculo = (c: (typeof candidatos)[number]) =>
    c.platform === "ifood"
      ? Boolean(c.api_store_id)
      : c.platform === "99food"
        ? com99.has(c.unit_id)
        : comCw.has(c.unit_id)

  /** A API respondeu de verdade pelo menos uma vez. É o que autoriza a frase. */
  const conectada = (c: (typeof candidatos)[number]) =>
    temVinculo(c) && jaVeioPelaApi.has(`${c.unit_id}|${c.platform}`)

  // Quem não é conexão de API sai da fila de vez: sem isto, cada varredura
  // reavaliaria as mesmas ~160 linhas todo dia pra sempre.
  //
  // ⚠️ O corte é por VÍNCULO, não por `conectada`. Loja vinculada que ainda
  // não recebeu dado da API não está fora de escopo — está esperando. Carimbar
  // ela aqui a tiraria da fila pra sempre, e no dia em que a API destravasse
  // o cliente nunca receberia o aviso. É o caso das lojas travadas hoje no
  // 403: elas TÊM vínculo e não podem ser descartadas.
  const foraDeEscopo = candidatos.filter((c) => !temVinculo(c))
  for (const c of foraDeEscopo) {
    await admin
      .from("unit_platforms")
      .update({ email_conectado_at: new Date().toISOString() })
      .eq("unit_id", c.unit_id)
      .eq("platform", c.platform)
      .is("email_conectado_at", null)
  }

  const alvos = candidatos.filter(conectada)

  let enviados = 0
  for (const a of alvos) {
    const antes = await jaAvisado(a.unit_id, a.platform)
    await avisarConexaoAtivada(a.unit_id, a.platform)
    if (!antes && (await jaAvisado(a.unit_id, a.platform))) enviados++
  }
  return { avaliadas: alvos.length, enviados }
}

/** O carimbo só fica gravado quando o e-mail saiu — serve de contador. */
async function jaAvisado(
  unitId: string,
  plataforma: PlataformaConexao,
): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("unit_platforms")
    .select("email_conectado_at")
    .eq("unit_id", unitId)
    .eq("platform", plataforma)
    .maybeSingle()
  return !!data?.email_conectado_at
}
