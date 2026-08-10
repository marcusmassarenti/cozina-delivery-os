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
  /** O que ainda falta o cliente fazer. Vazio = está tudo de pé. */
  pendencias: string[]
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

  if (plataforma === "ifood") {
    const [fin, ped, aval, plat] = await Promise.all([
      admin.rpc("resumo_conexao_ifood_financeiro", { p_unit_id: unitId }),
      admin
        .from("ifood_pedidos")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", unitId),
      admin
        .from("ifood_avaliacoes")
        .select("nota")
        .eq("unit_id", unitId)
        .not("nota", "is", null),
      admin
        .from("unit_platforms")
        .select("fin_enabled_at, review_enabled_at")
        .eq("unit_id", unitId)
        .eq("platform", "ifood")
        .maybeSingle(),
    ])

    const f = (fin.data as { total: number; de: string; ate: string }[] | null)?.[0]
    if (f?.total) {
      linhas.push({ rotulo: "Faturamento", valor: fmtBRL(Number(f.total)) })
      const p = periodo(f.de, f.ate)
      if (p) linhas.push({ rotulo: "Período", valor: p })
    }
    if (ped.count) linhas.push({ rotulo: "Pedidos", valor: String(ped.count) })

    const notas = (aval.data ?? []).map((a) => Number(a.nota))
    if (notas.length) {
      const media = notas.reduce((s, n) => s + n, 0) / notas.length
      linhas.push({
        rotulo: "Avaliações",
        valor: `${notas.length} · nota ${media.toFixed(1).replace(".", ",")}`,
      })
    } else {
      // A conexão do iFood nasce pela metade com facilidade: são DOIS apps no
      // Portal do Parceiro e nada avisa quando só um foi aprovado. Chamar isso
      // pelo nome aqui é a única chance do cliente perceber.
      pendencias.push(
        "As <strong>avaliações</strong> ainda não estão entrando. No Portal do Parceiro do iFood, confira se o app <strong>Avaliações</strong> também foi autorizado — ele é separado do Financial.",
      )
    }
    if (!f?.total && plat.data) {
      pendencias.push(
        "O <strong>faturamento</strong> ainda não apareceu. Se você autorizou só o app de Avaliações, falta o <strong>Financial</strong>.",
      )
    }
  }

  if (plataforma === "99food") {
    const { data } = await admin
      .from("ninefood_daily_loja")
      .select("data, faturamento_bruto, pedidos")
      .eq("unit_id", unitId)
      .order("data")
    const rows = data ?? []
    if (rows.length) {
      const bruto = rows.reduce((s, r) => s + Number(r.faturamento_bruto ?? 0), 0)
      const pedidos = rows.reduce((s, r) => s + Number(r.pedidos ?? 0), 0)
      if (bruto) linhas.push({ rotulo: "Faturamento", valor: fmtBRL(bruto) })
      const p = periodo(
        String(rows[0]!.data),
        String(rows[rows.length - 1]!.data),
      )
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

  return { linhas, pendencias, temDado: linhas.length > 0 }
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
export async function varrerConexoesNovas(): Promise<{
  avaliadas: number
  enviados: number
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("unit_platforms")
    .select("unit_id, platform, api_store_id")
    .is("email_conectado_at", null)
    .eq("active", true)
    .in("platform", ["ifood", "99food", "cardapioweb"])

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

  const conectada = (c: (typeof candidatos)[number]) =>
    c.platform === "ifood"
      ? Boolean(c.api_store_id)
      : c.platform === "99food"
        ? com99.has(c.unit_id)
        : comCw.has(c.unit_id)

  // Quem não é conexão de API sai da fila de vez: sem isto, cada varredura
  // reavaliaria as mesmas ~160 linhas todo dia pra sempre.
  const foraDeEscopo = candidatos.filter((c) => !conectada(c))
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
