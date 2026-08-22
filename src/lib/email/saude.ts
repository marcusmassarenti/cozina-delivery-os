/**
 * E-mail diário de saúde das integrações.
 *
 * O veredito vai no ASSUNTO. Num dia verde você resolve o relatório sem abrir
 * — e é isso que faz o hábito durar: relatório que exige abrir todo dia pra
 * ler "está tudo bem" deixa de ser lido na segunda semana, justamente quando
 * aparece o primeiro problema de verdade.
 *
 * Dentro, o que está OK vira contagem; só o que precisa de ação ganha linha.
 */
import "server-only"

import type { AlertaVenda } from "@/lib/data/alertas-venda"

import type {
  OportunidadeConexao,
  SaudeIntegracoes,
} from "@/lib/data/saude-integracoes"
import type { RodadaDiaria } from "@/lib/data/rodada-diaria"
import type { LojaAgrupada, SaudeAgrupada } from "@/lib/data/saude-agrupada"
import type { PlatformId } from "@/components/platform-logo"
import { fmtBytes, type InfraMetricas } from "@/lib/data/infra-metricas"
import { rotulo } from "@/lib/cron-labels"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
const LARANJA = "#ff4d1c"

const COR = {
  alerta: { fundo: "#fef2f2", borda: "#dc2626", texto: "#991b1b" },
  atencao: { fundo: "#fffbeb", borda: "#d97706", texto: "#92400e" },
  ok: { fundo: "#f0fdf4", borda: "#16a34a", texto: "#166534" },
} as const

/** Nome da plataforma como o Marcus fala, não como o banco guarda. */
const NOMES: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

function bloco(g: "alerta" | "atencao" | "ok", titulo: string, itens: string[]): string {
  if (!itens.length) return ""
  const c = COR[g]
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:${c.fundo};border-left:4px solid ${c.borda};border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${c.texto};">${titulo}</p>
      ${itens.map((i) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3f3f46;">${i}</p>`).join("")}
    </td></tr>
  </table>`
}

/** Só as plataformas que a rede realmente usa entram no placar. */
function placar(r: SaudeIntegracoes["resumo"]): string {
  return (
    [
      ["iFood", r.ifood],
      ["99 Food", r.noveNove],
      ["Keeta", r.keeta],
      ["Cardápio Web", r.cardapioWeb],
    ] as const
  )
    .filter(([, v]) => v.total > 0)
    .map(([nome, v]) => `${nome} ${v.ok}/${v.total}`)
    .join(", ")
}

const num = (n: number) => n.toLocaleString("pt-BR")

/** dd/mm a partir de "YYYY-MM-DD". */
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Logos das plataformas afetadas, lado a lado.
 *
 * Os arquivos são os mesmos que o app usa (`/platforms/{id}.png`), servidos do
 * site — cliente de e-mail não resolve caminho relativo. `alt` carrega o nome
 * porque boa parte dos clientes bloqueia imagem por padrão: sem ele a linha
 * perderia justamente a informação de QUAL plataforma caiu.
 */
function logos(plats: PlatformId[]): string {
  return plats
    .map(
      (p) =>
        `<img src="${SITE}/platforms/${p}.png" width="16" height="16" alt="${NOMES[p] ?? p}" title="${NOMES[p] ?? p}" style="display:inline-block;width:16px;height:16px;border-radius:4px;vertical-align:-3px;margin-right:3px;" />`,
    )
    .join("")
}

/**
 * "desde 26/07 · último pedido 26/07" — a forma que o Marcus pediu.
 *
 * O texto muda com o TIPO porque as duas situações pedem reações diferentes:
 * loja que parou de vender é operação; loja vendendo com o financeiro atrasado
 * é integração. Escrever "parou" nas duas fazia o e-mail dizer que uma loja
 * que faturou hoje de manhã estava morta.
 */
function quando(l: LojaAgrupada): string {
  if (l.tipo === "nunca" || l.dias === null) return "sem nenhum dado ainda"
  if (l.tipo === "financeiro") {
    return `vendendo, mas o financeiro parou em ${l.ultimoFinanceiro ? dm(l.ultimoFinanceiro) : "?"}${
      l.ultimoPedido ? ` · vendeu até ${dm(l.ultimoPedido)}` : ""
    }`
  }
  const desde = l.desde ? `sem dado desde ${dm(l.desde)}` : ""
  const ult = l.ultimoPedido ? ` · último pedido ${dm(l.ultimoPedido)}` : ""
  return `${desde}${ult}`
}

/**
 * "PAROU HOJE" — a única seção que sai sempre aberta, com nome e logo.
 *
 * É a notícia do dia. Tudo que já estava parado ontem desce pro bloco
 * agrupado: repetir as mesmas 15 lojas todo dia é o caminho mais curto pra
 * este e-mail deixar de ser lido.
 */
function blocoPararamHoje(g: SaudeAgrupada): string {
  if (!g.pararamHoje.length) return ""
  const c = COR.alerta
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:${c.fundo};border-left:4px solid ${c.borda};border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${c.texto};">
        Começou hoje (${g.totalPararamHoje})
      </p>
      ${g.pararamHoje
        .map(
          (grupo) => `
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.4px;color:#71717a;text-transform:uppercase;">${grupo.cliente}</p>
      ${grupo.lojas
        .map(
          (l) => `
      <p style="margin:0 0 8px;padding-left:2px;font-size:14px;line-height:1.5;color:#3f3f46;">
        ${logos(l.plataformas)} <strong>${l.loja}</strong>
        <span style="color:#71717a;font-size:13px;">— ${quando(l)}</span>
      </p>`,
        )
        .join("")}`,
        )
        .join("")}
    </td></tr>
  </table>`
}

/** Quantas lojas de cada cliente aparecem com nome antes de virar contagem. */
const TETO_POR_CLIENTE = 3

/**
 * "SEGUE PARADO" — o inventário, comprimido.
 *
 * Uma linha por cliente com a contagem, e só as três mais antigas com nome. É
 * o que mantém o e-mail do mesmo tamanho com 75 ou com 500 lojas: o que cresce
 * é o número dentro da linha, não a quantidade de linhas.
 */
function blocoSeguemParadas(g: SaudeAgrupada): string {
  if (!g.seguemParadas.length) return ""
  const c = COR.atencao
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:${c.fundo};border-left:4px solid ${c.borda};border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${c.texto};">
        Já vinha de antes (${g.totalSeguemParadas})
      </p>
      <p style="margin:0 0 12px;font-size:12px;color:#71717a;">Estas já apareceram em relatórios anteriores.</p>
      ${g.seguemParadas
        .map((grupo) => {
          const mostra = grupo.lojas.slice(0, TETO_POR_CLIENTE)
          const resto = grupo.lojas.length - mostra.length
          return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px;">
        <tr><td style="padding:0 0 3px;font-size:13px;color:#3f3f46;">
          <strong>${grupo.cliente}</strong>
          <span style="color:#71717a;">· ${grupo.lojas.length} loja${grupo.lojas.length === 1 ? "" : "s"}${
            grupo.piorDias !== null
              ? ` · a mais antiga há ${grupo.piorDias} dia${grupo.piorDias === 1 ? "" : "s"}`
              : ""
          }</span>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.7;color:#71717a;">
          ${mostra
            .map(
              (l) =>
                `${logos(l.plataformas)}${l.loja}${l.dias !== null ? ` <span style="color:#a1a1aa;">${l.dias}d</span>` : ""}`,
            )
            .join(" &nbsp;·&nbsp; ")}${
              resto > 0
                ? ` &nbsp;·&nbsp; <a href="${SITE}/saude" style="color:${LARANJA};text-decoration:none;font-weight:700;">+${resto} outra${resto === 1 ? "" : "s"} →</a>`
                : ""
            }
        </td></tr>
      </table>`
        })
        .join("")}
    </td></tr>
  </table>`
}

/**
 * "NUNCA CONECTOU" — uma linha, sempre.
 *
 * São 87 de 158 sinais hoje: mais da metade do relatório era isto, repetido em
 * linha própria por loja e por plataforma. Não é defeito de integração — é
 * loja que marcou a plataforma no cadastro e nunca autorizou. Vira contagem
 * com link, e o e-mail volta a ser sobre o que quebrou.
 */
/**
 * "Quem ainda não conectou" — oportunidade, não alerta.
 *
 * ── POR QUE É UM BLOCO À PARTE (Marcus, 19/08/26) ────────────────────────
 * Estas lojas saíram da saúde no mesmo dia: "as outras não dependem do nosso
 * trabalho, não preciso saber se a pessoa importou ou não planilha". Misturado
 * ao alerta, isto era ruído — cobrava de nós uma tarefa do cliente e enterrava
 * a falha de verdade.
 *
 * Só que a lista em si vale: cada linha é uma loja rodando na planilha que
 * poderia estar na API. Por isso volta com outra função — não é "consertar", é
 * "ligar pra esse cliente". Tom neutro e ordenado pelo tamanho: quem tem 12
 * lojas soltas rende mais que quem tem 1.
 *
 * A Keeta não entra: não existe API dela, e oferecer o que não temos é pior
 * que não oferecer nada.
 */
function blocoOportunidades(itens: OportunidadeConexao[]): string {
  const total = itens.reduce((a, o) => a + o.total, 0)
  const linhas = itens
    .slice(0, 12)
    .map((o) => {
      const detalhe = [
        o.ifood ? `${o.ifood} iFood` : null,
        o.noveNove ? `${o.noveNove} 99 Food` : null,
        o.cardapioWeb ? `${o.cardapioWeb} Cardápio Web` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      return `<tr>
        <td style="padding:7px 10px 7px 0;font-size:13px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${o.cliente}</td>
        <td style="padding:7px 10px;font-size:13px;color:#71717a;border-bottom:1px solid #f4f4f5;">${detalhe}</td>
        <td style="padding:7px 0;font-size:13px;font-weight:700;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${o.total}</td>
      </tr>`
    })
    .join("")
  const resto = itens.length > 12 ? itens.length - 12 : 0

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0c4a6e;">
        Dá pra conectar mais ${total} loja${total === 1 ? "" : "s"}
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#52525b;">
        Vendem na plataforma e ainda entram por planilha. Não é falha —
        é onde a API tira trabalho manual de alguém.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${linhas}
      </table>
      ${
        resto > 0
          ? `<p style="margin:10px 0 0;font-size:12px;color:#71717a;">+ ${resto} outro${resto === 1 ? "" : "s"} cliente${resto === 1 ? "" : "s"}.</p>`
          : ""
      }
      <p style="margin:12px 0 0;font-size:13px;">
        <a href="${SITE}/clientes/conexoes" style="color:${LARANJA};text-decoration:none;font-weight:700;">Ver as conexões →</a>
      </p>
    </td></tr>
  </table>`
}

/**
 * "O que entrou hoje" — o volume que as rotinas trouxeram nas últimas 24h.
 *
 * Fica ANTES dos blocos de problema de propósito. É a confirmação positiva que
 * o Marcus pediu: num dia normal ele lê esta tabela, vê números onde esperava
 * números, e fecha o e-mail. O bloco só fica vermelho quando o dado não veio.
 */
function blocoRodada(rd: RodadaDiaria): string {
  const c = rd.gravidade === "alerta" ? COR.alerta : rd.gravidade === "atencao" ? COR.atencao : COR.ok
  const mesLabel = (() => {
    const [a, m] = rd.competencia.split("-")
    return `${m}/${a.slice(2)}`
  })()
  const linhas = rd.fontes
    .map(
      (f) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#3f3f46;">${f.rotulo}</td>
        <td style="padding:7px 0;font-size:13px;color:#71717a;text-align:right;white-space:nowrap;">${f.lojas} loja${f.lojas === 1 ? "" : "s"}</td>
        <td style="padding:7px 0 7px 14px;font-size:13px;font-weight:700;color:#18181b;text-align:right;white-space:nowrap;">${num(f.linhas)}</td>
      </tr>`,
    )
    .join("")

  // A linha do extrato é a que mais importa e por isso vem destacada: é o
  // dado que chega ASSÍNCRONO, e é o único que pode faltar sem nada quebrar.
  const extratoOk = rd.extrato.fecharamHoje === rd.extrato.conectadas
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:${c.fundo};border-left:4px solid ${c.borda};border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${c.texto};">O que entrou nas últimas 24h</p>
      <p style="margin:0 0 12px;font-size:13px;color:#3f3f46;">${rd.motivo}</p>
      ${
        rd.fontes.length
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(0,0,0,.07);">${linhas}</table>`
          : `<p style="margin:0;font-size:13px;color:${COR.alerta.texto};font-weight:700;">Nenhuma linha entrou. As rotinas podem ter rodado sem trazer dado.</p>`
      }
      <p style="margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(0,0,0,.07);font-size:13px;color:#3f3f46;">
        <strong>Extrato de ${mesLabel}:</strong> fechou em
        <strong style="color:${extratoOk ? COR.ok.texto : COR.atencao.texto};">${rd.extrato.fecharamHoje}/${rd.extrato.conectadas}</strong>
        lojas hoje.
        ${
          extratoOk
            ? "Todas as conectadas em dia."
            : rd.extrato.atrasadas.length === 0
              ? // Fechar em poucas lojas num dia é normal: o iFood gera o
                // extrato numa fila e o que não sai a tempo entra na rodada
                // seguinte. Só vira problema quando passa dias — e aí a loja
                // aparece com nome nos blocos acima.
                "As demais fecharam nas rodadas anteriores; nenhuma passou de 2 dias."
              : `<strong style="color:${COR.atencao.texto};">${rd.extrato.atrasadas.length}</strong> com atraso de 2+ dias (listadas acima).`
        }
      </p>
    </td></tr>
  </table>`
}

/** Uma linha da conferência API × planilha (só as que divergem em dia). */
export type ConferenciaResumo = {
  clienteNome: string
  unitCode: string
  unitName: string
  plataforma: string
  pedidosApi: number
  pedidosPlanilha: number
  provavelMotivo: string
}


/**
 * Peso do sistema: banco, storage e quem cresceu.
 *
 * Vai DEPOIS do "o que entrou": a pergunta natural depois de ver 12 mil linhas
 * novas é "isso custa quanto?". Linha e byte não andam juntos — 200 mil linhas
 * de log pesam mais que 200 mil lançamentos — e é o byte que aparece na fatura.
 *
 * Sem cor de alerta de propósito. Crescer é o esperado num sistema que importa
 * dado todo dia; pintar de vermelho o normal treina a pessoa a ignorar
 * vermelho. Quem julga se 40 MB/dia é muito é quem lê, olhando a inclinação.
 */
function blocoInfra(m: InfraMetricas): string {
  const delta = (v: number | null) =>
    v == null
      ? '<span style="color:#a1a1aa;">primeira medição</span>'
      : v === 0
        ? '<span style="color:#71717a;">sem mudança</span>'
        : `<span style="color:${v > 0 ? "#b45309" : "#166534"};font-weight:700;">${v > 0 ? "+" : "−"}${fmtBytes(Math.abs(v))}</span>`

  const janela =
    m.diasDesdeAnterior && m.diasDesdeAnterior > 1
      ? ` <span style="font-size:12px;color:#a1a1aa;">(${m.diasDesdeAnterior} dias sem medir)</span>`
      : ""

  const linha = (rot: string, valor: string, extra: string) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#3f3f46;">${rot}</td>
        <td style="padding:7px 0;font-size:13px;font-weight:700;color:#18181b;text-align:right;white-space:nowrap;">${valor}</td>
        <td style="padding:7px 0 7px 14px;font-size:13px;text-align:right;white-space:nowrap;">${extra}</td>
      </tr>`

  // Sem medição anterior não dá pra falar de crescimento — mas dá pra mostrar
  // QUEM pesa. Dizer "nenhuma tabela cresceu" na primeira vez seria afirmar
  // algo que não foi medido.
  const primeiraVez = m.dbDelta == null
  const lista = primeiraVez ? m.maiores : m.cresceram
  const listaHtml = lista
    .map(
      (t) => `
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#52525b;font-family:ui-monospace,Menlo,monospace;">${t.tabela}</td>
        <td style="padding:5px 0;font-size:12px;color:#71717a;text-align:right;white-space:nowrap;">${fmtBytes(t.bytes)}</td>
        <td style="padding:5px 0 5px 14px;font-size:12px;font-weight:700;color:#b45309;text-align:right;white-space:nowrap;">${t.delta == null ? "" : `+${fmtBytes(t.delta)}`}</td>
      </tr>`,
    )
    .join("")

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:#fafafa;border-left:4px solid #a1a1aa;border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#52525b;">Quanto o sistema pesa${janela}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(0,0,0,.07);">
        ${linha("Banco de dados", fmtBytes(m.dbBytes), delta(m.dbDelta))}
        ${linha(`Storage (${m.storageArquivos} arquivos)`, fmtBytes(m.storageBytes), delta(m.storageDelta))}
      </table>
      ${
        listaHtml
          ? `<p style="margin:14px 0 6px;font-size:12px;font-weight:700;color:#52525b;">${primeiraVez ? "As maiores tabelas" : "O que cresceu"}</p>
             <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${listaHtml}</table>
             ${primeiraVez ? `<p style="margin:8px 0 0;font-size:12px;color:#71717a;">Primeira medição: o crescimento por tabela aparece a partir do próximo relatório.</p>` : ""}`
          : `<p style="margin:14px 0 0;font-size:12px;color:#71717a;">Nenhuma tabela cresceu mais de 1 MB — abaixo disso é vacuum e índice respirando, não dado novo.</p>`
      }
    </td></tr>
  </table>`
}

export function emailSaude(
  s: SaudeIntegracoes,
  /**
   * Conferência entre as duas fontes do mesmo pedido. Vai NESTE e-mail e não
   * num novo: já é o relatório interno diário, e um segundo e-mail competiria
   * com ele pela mesma atenção.
   *
   * Sem limiar por enquanto — de propósito. A lista sai crua e ordenada pra a
   * gente ver a distribuição real na base antes de escolher o corte, em vez de
   * calibrar o alarme por palpite.
   */
  conferencia: ConferenciaResumo[] = [],
  /**
   * O que as rotinas TROUXERAM nas últimas 24h.
   *
   * Sem isto o relatório respondia "rodou?" mas não "chegou dado?" — e as duas
   * respostas divergem. Em 08/ago/26 a rodada das 06h executou nas 64 lojas e
   * o extrato do mês fechou em 14: tudo verde, 46 lojas sem o dado do dia.
   */
  rodada?: RodadaDiaria,
  /**
   * Lojas com problema já agrupadas e separadas entre "parou hoje" e "segue
   * parado". Sem isto o e-mail volta ao formato de uma linha por
   * (loja × plataforma), que a 500 lojas passa de mil linhas.
   */
  g?: SaudeAgrupada,
  /**
   * Peso do banco e do storage, com o delta do dia. Opcional: se a medição
   * falhar, o relatório sai sem o bloco — nunca deixa de sair por causa dele.
   */
  infra?: InfraMetricas | null,
  /**
   * Lojas vendendo menos do que elas mesmas vendiam.
   *
   * Vai NESTE e-mail de propósito, e não num alerta próprio: as duas seções
   * respondem à mesma pergunta do dia — "o que precisa de mim?" — e um segundo
   * e-mail competiria com este pela mesma atenção. A diferença é que as de
   * cima são problema NOSSO e esta é problema do CLIENTE.
   */
  quedas: AlertaVenda[] = [],
): { assunto: string; html: string } {
  const r = s.resumo
  const cronsRuins = s.crons.filter((c) => c.gravidade === "alerta")
  const cronsAviso = s.crons.filter((c) => c.gravidade === "atencao")
  // Loja parada na fila de conexão não é "integração com defeito" — é conexão
  // que nunca começou. Entra nos mesmos blocos porque a pergunta é a mesma:
  // tem algo esperando alguém agir?
  /**
   * Loja vinculada que o iFood parou de listar.
   *
   * Sempre ALERTA: o dado dela parou de entrar e o cliente segue vendo os
   * números do dia em que sumiu como se fossem os de hoje. A Pizzaria Quero
   * Mais (Vbfood) passou cinco dias assim, em silêncio (18/08/26).
   *
   * ⚠️ O texto diz o FATO e manda CONFERIR — não acusa o lojista de ter
   * removido o app. Já aconteceu de a loja sumir da lista e continuar "Ativo"
   * no Portal do Parceiro; cobrar do cliente uma reautorização que ele já fez
   * queima confiança à toa.
   */
  const linhaSumida = (m: (typeof s.lojasSumidas)[number]) =>
    `<strong>${m.empresa} · ${m.unitName}</strong> <span style="font-size:12px;color:#71717a;">(sumiu da lista do iFood)</span><br/>` +
    `Sem aparecer há ${m.dias} dia${m.dias === 1 ? "" : "s"} — o financeiro dela ` +
    `parou de entrar e a sincronização foi pausada. Confira o CNPJ ${m.cnpj ?? "—"} ` +
    `na aba Permissões do Portal do Parceiro: pode ser remoção do app ou falha do iFood em listar.`

  const filaRuim = s.filaIfood.filter((f) => f.gravidade === "alerta")
  const filaAviso = s.filaIfood.filter((f) => f.gravidade === "atencao")
  const linhaFila = (f: (typeof s.filaIfood)[number]) =>
    `<strong>${f.cliente} · ${f.loja}</strong> <span style="font-size:12px;color:#71717a;">(conexão iFood)</span><br/>${f.motivo}`

  // A rodada entra no veredito com o mesmo peso das lojas e dos crons: "o dado
  // não chegou" é problema, mesmo com tudo o resto verde.
  const rodadaAlerta = rodada?.gravidade === "alerta"
  const rodadaAtencao = rodada?.gravidade === "atencao"
  const extratoRuins =
    rodada?.extrato.atrasadas.filter((a) => a.gravidade === "alerta") ?? []
  const extratoAviso =
    rodada?.extrato.atrasadas.filter((a) => a.gravidade === "atencao") ?? []
  const linhaExtrato = (a: NonNullable<typeof rodada>["extrato"]["atrasadas"][number]) =>
    `<strong>${a.cliente} · ${a.loja}</strong> <span style="font-size:12px;color:#71717a;">(extrato do mês)</span><br/>${
      a.dias === null
        ? "nunca fechou o extrato deste mês"
        : `sem fechar há ${a.dias} dia${a.dias === 1 ? "" : "s"}`
    }`

  /* O assunto carrega o veredito inteiro. É a única linha que você é obrigado
   * a ler, então ela precisa bastar.
   *
   * Ele passou a falar em DELTA — "2 pararam hoje" em vez de "17 problemas".
   * O total não muda de um dia pro outro quando ninguém age, então repetido
   * por 12 dias ele vira paisagem; a novidade, não. Os nomes dos clientes
   * afetados entram porque dizem, sem abrir, se é problema seu ou de cliente.
   */
  const tudoCerto = s.tudoCerto && !rodadaAlerta && (g?.totalPararamHoje ?? 0) === 0
  const emObservacao =
    (g?.totalSeguemParadas ?? 0) +
    cronsAviso.length +
    filaAviso.length +
    (rodadaAtencao ? 1 : 0)
  const novas = g?.totalPararamHoje ?? 0
  const clientesNovos = (g?.pararamHoje ?? []).map((x) => x.cliente)
  const assunto = !tudoCerto
    ? novas > 0
      ? // "parou" seria mentira em metade dos casos: boa parte destas lojas
        // está vendendo e o que atrasou foi o financeiro. "Com dado faltando"
        // cobre as duas sem dramatizar nenhuma.
        `⚠️ ${novas} ${novas === 1 ? "loja" : "lojas"} com dado faltando hoje${
          g && g.totalSeguemParadas > 0 ? ` · ${g.totalSeguemParadas} de antes` : ""
        }${clientesNovos.length ? ` — ${clientesNovos.slice(0, 3).join(", ")}` : ""}`
      : // Sem novidade em loja, mas algo em rotina/conexão/extrato caiu.
        `⚠️ ${cronsRuins.length + filaRuim.length + extratoRuins.length + s.lojasSumidas.length + (rodadaAlerta ? 1 : 0)} nas rotinas — ${placar(r)}`
    : emObservacao > 0
      ? `✅ Nada novo hoje — ${placar(r)}, ${emObservacao} em observação`
      : `✅ Tudo certo — ${placar(r)}`

  const html = `
<div style="margin:0;padding:32px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#ffffff;border-radius:16px;padding:36px 32px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding-right:12px;">
            <img src="${SITE}/deliveryos-icon.png" width="36" height="36" alt="D"
                 style="display:block;width:36px;height:36px;border-radius:9px;background:${LARANJA};" />
          </td>
          <td style="font-size:12px;font-weight:700;letter-spacing:1.6px;color:#71717a;text-transform:uppercase;">Delivery OS · Saúde</td>
        </tr>
      </table>

      <h1 style="margin:0 0 6px;font-size:24px;line-height:1.3;color:#18181b;font-weight:700;">
        ${!tudoCerto ? "Tem coisa pra olhar" : emObservacao > 0 ? "Sem alertas hoje" : "Tudo sincronizando"}
      </h1>
      <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Checado em ${hora(s.geradoEm)}</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
        <tr>
          ${[
            ["iFood", r.ifood],
            ["99 Food", r.noveNove],
            ["Keeta", r.keeta],
            ["Cardápio Web", r.cardapioWeb],
          ]
            .filter(([, v]) => (v as { total: number }).total > 0)
            .map(([nome, v]) => {
              const x = v as { ok: number; total: number; alerta: number }
              return `<td style="padding:14px;background:${x.alerta ? COR.alerta.fundo : COR.ok.fundo};border-radius:10px;text-align:center;">
            <p style="margin:0;font-size:26px;font-weight:700;color:${x.alerta ? COR.alerta.texto : COR.ok.texto};">${x.ok}/${x.total}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#71717a;">${nome}</p>
          </td><td style="width:8px;"></td>`
            })
            .join("")}
          <td style="padding:14px;background:${cronsRuins.length ? COR.alerta.fundo : COR.ok.fundo};border-radius:10px;text-align:center;">
            <p style="margin:0;font-size:26px;font-weight:700;color:${cronsRuins.length ? COR.alerta.texto : COR.ok.texto};">${r.cronsOk}/${s.crons.length}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#71717a;">rotinas rodando</p>
          </td>
        </tr>
      </table>

      ${rodada ? blocoRodada(rodada) : ""}
      ${infra ? blocoInfra(infra) : ""}

      ${g ? blocoPararamHoje(g) : ""}

      ${g ? blocoSeguemParadas(g) : ""}

      ${bloco("alerta", "Rotinas e conexões", [
        ...cronsRuins.map(
          (c) => `<strong>${rotulo(c.nome).titulo}</strong><br/>${c.motivo}`,
        ),
        ...s.lojasSumidas.map(linhaSumida),
        ...filaRuim.map(linhaFila),
        ...extratoRuins.map(linhaExtrato),
      ])}

      ${bloco("atencao", "De olho", [
        ...cronsAviso.map(
          (c) => `<strong>${rotulo(c.nome).titulo}</strong><br/>${c.motivo}`,
        ),
        ...filaAviso.map(linhaFila),
        ...extratoAviso.map(linhaExtrato),
      ])}

      ${s.oportunidades.length > 0 ? blocoOportunidades(s.oportunidades) : ""}

      ${
        tudoCerto && emObservacao === 0
          ? bloco("ok", "Nada a fazer", [
              `Placar de hoje: ${placar(r)} — todas com o dado em dia com as próprias vendas. E as ${r.cronsOk} rotinas rodaram nas últimas 24h.`,
            ])
          : ""
      }

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 4px;">
        <tr><td align="center">
          <a href="${SITE}/saude" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:15px;font-weight:700;">Ver o detalhe de todas as lojas</a>
        </td></tr>
      </table>

      ${
        conferencia.length > 0
          ? `
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#18181b;">API × planilha — ${conferencia.length} loja(s) com dia faltando</p>
      <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#71717a;">
        Comparação entre o que a API trouxe e o que o cliente subiu, por dia. Só entram lojas que têm as DUAS fontes.
      </p>
      ${conferencia
        .map(
          (c) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;background:#fafafa;border-radius:10px;">
        <tr><td style="padding:10px 12px;font-size:13px;line-height:1.6;color:#3f3f46;">
          <strong>${c.clienteNome} · ${c.unitCode} ${c.unitName}</strong>
          <span style="font-size:12px;color:#71717a;">(${c.plataforma})</span><br/>
          API ${c.pedidosApi} pedidos · planilha ${c.pedidosPlanilha}<br/>
          <span style="color:#71717a;">${c.provavelMotivo}</span>
        </td></tr>
      </table>`,
        )
        .join("")}`
          : ""
      }

      ${
        quedas.length > 0
          ? `
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#18181b;">Vendendo menos que o normal — ${quedas.length} loja(s)</p>
      <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#71717a;">
        Cada loja comparada com ELA MESMA: os últimos 7 dias contra a média semanal das 4 semanas anteriores.
        Ordenado por pedidos a menos, não por porcentagem — 100 pedidos a menos numa loja grande pesa mais que 80% a menos numa que fazia 10.
      </p>
      ${quedas
        .map(
          (q) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;background:${q.estado === "parou" ? "#fef2f2" : "#fffbeb"};border-radius:10px;">
        <tr><td style="padding:10px 12px;font-size:13px;line-height:1.6;color:#3f3f46;">
          <strong>${q.cliente} · ${q.code} ${q.loja}</strong>
          <span style="font-size:12px;font-weight:700;color:${q.estado === "parou" ? "#b91c1c" : "#b45309"};">
            ${q.estado === "parou" ? "PAROU" : `−${q.quedaPct}%`}
          </span><br/>
          ${q.pedidosRecentes} pedidos nos últimos 7 dias · normal seria ~${q.pedidosBase}
          <strong>(${q.pedidosAMenos} a menos)</strong><br/>
          <span style="font-size:12px;color:#71717a;">dado desta loja até ${q.ancora.slice(8, 10)}/${q.ancora.slice(5, 7)}</span>
        </td></tr>
      </table>`,
        )
        .join("")}`
          : ""
      }

      <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
        Loja sem venda não gera lançamento — por isso a comparação é entre o último pedido e o último dado financeiro de cada loja, não contra o calendário.
      </p>

    </td></tr>
    <tr><td align="center" style="padding:16px 0 0;font-size:12px;color:#a1a1aa;">Delivery OS · relatório interno</td></tr>
  </table>
</div>`.trim()

  return { assunto, html }
}
