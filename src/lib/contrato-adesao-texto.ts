/**
 * O texto do Termo de Adesão — o contrato que nasce quando o cliente assina.
 *
 * Módulo PURO (sem server-only): a página pública mostra estas frases e o
 * servidor calcula o hash sobre ELAS MESMAS. Se a página tivesse um texto e o
 * hash outro, o comprovante provaria o aceite de um documento que ninguém viu.
 *
 * ── COMO O TERMO SE ENCAIXA NO CONTRATO ──────────────────────────────────
 * O Contrato de Prestação de Serviços (/contrato) foi escrito pra venda com
 * proposta: ele "é parte integrante e complementar da Proposta Comercial", que
 * qualifica o cliente e fixa preço. Quem assina sozinho pelo checkout não tem
 * proposta — então o Termo de Adesão faz esse papel. E como o contrato-mestre
 * fala em prazo mínimo de 12 meses (que não vale pro mensal, vendido "sem
 * fidelidade"), o Termo declara que as condições dele PREVALECEM. Assim o
 * contrato-mestre não precisa mudar — e mudá-lo exigiria avisar todos os
 * clientes com 30 dias (cláusula 14.1).
 *
 * ⚠️ MUDOU UMA FRASE AQUI? Termos já aceitos continuam valendo pelo que foi
 * aceito: o hash deles cobre o texto antigo, e quem abrir o link verá o texto
 * de hoje. Pra não cair nessa, a frase nova precisa entrar condicionada à
 * `versaoTermo` gravada em `dados` — nunca reescrevendo a frase velha.
 */
import {
  PARCELAS_12X,
  ROTULO_CICLO,
  type BillingCycle,
} from "@/lib/pricing"

/** Versão do contrato-mestre em /contrato. Sobe junto com qualquer mudança lá. */
export const CONTRATO_VERSAO = "1.0"
export const CONTRATO_ATUALIZADO_EM = "14 de agosto de 2026"

/** Versão do texto DESTE termo (as condições abaixo). */
export const TERMO_VERSAO = "1.0"

/** Quem presta o serviço. É a Lab of Change, não a Cozina Foods. */
export const CONTRATADA = {
  razaoSocial: "LAB OF CHANGE LTDA",
  cnpj: "38.613.971/0001-80",
  marca: "Delivery OS",
} as const

/** O quadro-resumo, congelado no aceite (vai em `contratos_assinatura.dados`). */
export type DadosAdesao = {
  versaoTermo: string
  contratante: {
    nome: string
    documento: string
    endereco: string
    email: string
  }
  plano: {
    id: string
    nome: string
    /** Preço-base do anual à vista (null quando o preço é combinado). */
    precoPrimeiraLoja: number | null
    precoAdicional: number | null
    personalizado: boolean
  }
  lojas: number
  ciclo: BillingCycle
  /** Valor por mês do ciclo. No 12x, é a parcela. */
  valorMensal: number
  /** O que se cobra por ciclo: o mês, o ano à vista ou o total do ano em 12x. */
  valorCiclo: number
  parcelas: number | null
  /** Acréscimo do 12x sobre o à vista, em %, no dia do aceite. */
  acrescimo12xPct: number | null
  /** Primeira cobrança diferente das demais (cupom ou desconto negociado). */
  primeiraCobranca: { valor: number; motivo: string } | null
  formaPagamento: string
  /** Dia do aceite (YYYY-MM-DD). */
  inicio: string
  /** Fim do primeiro período nos ciclos anuais (YYYY-MM-DD). */
  fimPrimeiroPeriodo: string | null
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—"

const pct = (v: number) =>
  `${Number.isInteger(v) ? v : v.toFixed(2).replace(".", ",")}%`

/** Rótulo do ciclo como aparece no quadro-resumo. */
export function rotuloCicloAdesao(d: DadosAdesao): string {
  return d.plano.personalizado ? "Mensal (valor combinado)" : ROTULO_CICLO[d.ciclo]
}

/** Uma condição do termo: título curto + texto. */
export type Condicao = { titulo: string; texto: string }

/**
 * As condições comerciais do termo, na ordem em que aparecem.
 *
 * O texto depende do ciclo porque cancelar significa coisas diferentes em cada
 * um: no mensal, para a cobrança; no anual à vista, para a renovação; no 12x,
 * para a renovação MAS as parcelas seguem no cartão — o banco já aprovou a
 * compra inteira. Escrever isso antes é o que evita a discussão depois.
 */
export function condicoesDoTermo(d: DadosAdesao): Condicao[] {
  const out: Condicao[] = [
    {
      titulo: "Natureza deste termo",
      texto: `Este Termo de Adesão qualifica o CONTRATANTE e fixa as condições comerciais da contratação do ${CONTRATADA.marca}. Para os fins do Contrato de Prestação de Serviços de Software (versão ${CONTRATO_VERSAO}), reproduzido na íntegra abaixo, este Termo faz as vezes da Proposta Comercial. Havendo divergência entre os dois, prevalecem as condições deste Termo.`,
    },
  ]

  const forma = d.formaPagamento.toLowerCase()

  if (d.plano.personalizado || d.ciclo === "mensal") {
    out.push(
      {
        titulo: "Cobrança",
        texto: `${brl(d.valorMensal)} por mês, em cobrança recorrente (${forma}), renovada automaticamente a cada mês.`,
      },
      {
        titulo: "Permanência e cancelamento",
        texto:
          "Não há prazo mínimo de permanência nem multa por cancelamento. O CONTRATANTE pode cancelar a qualquer momento na área Assinatura do sistema; o acesso segue até o fim do mês já pago, sem reembolso proporcional.",
      },
    )
  } else if (d.ciclo === "anual") {
    out.push(
      {
        titulo: "Cobrança",
        texto: `${brl(d.valorCiclo)} à vista (${forma}), correspondente a 12 (doze) meses de uso — o equivalente a ${brl(d.valorMensal)} por mês —, cobrados no início de cada período anual.`,
      },
      {
        titulo: "Renovação",
        texto:
          "Ao fim de cada período, a contratação é renovada automaticamente por mais 12 (doze) meses, com nova cobrança à vista pelos valores vigentes, salvo cancelamento antes da data de renovação.",
      },
      {
        titulo: "Cancelamento",
        texto:
          "O cancelamento interrompe a renovação. O acesso segue até o fim do período já pago, sem reembolso proporcional.",
      },
    )
  } else {
    const parcelas = d.parcelas ?? PARCELAS_12X
    out.push(
      {
        titulo: "Cobrança",
        texto: `O período de 12 (doze) meses é pago no cartão de crédito em ${parcelas} parcelas mensais de ${brl(d.valorMensal)}, totalizando ${brl(d.valorCiclo)}.${d.acrescimo12xPct != null ? ` O valor do anual em 12x corresponde ao preço do anual à vista acrescido de ${pct(d.acrescimo12xPct)}.` : ""}`,
      },
      {
        titulo: "Limite do cartão",
        texto:
          "Por se tratar de compra parcelada, a administradora do cartão reserva o valor total no limite do CONTRATANTE no momento do pagamento, e as parcelas são lançadas mês a mês na fatura do cartão.",
      },
      {
        titulo: "Cancelamento",
        texto:
          "O cancelamento interrompe apenas a renovação. As parcelas já contratadas continuam sendo lançadas pela administradora do cartão até a última, e o acesso segue até o fim do período de 12 (doze) meses.",
      },
      {
        titulo: "Renovação",
        texto:
          "Quinze (15) dias antes do fim do período, é emitida nova cobrança parcelada para os 12 (doze) meses seguintes, pelos valores vigentes, enviada ao e-mail cadastrado. Não paga até o fim do período, o acesso é suspenso após 7 (sete) dias de tolerância.",
      },
    )
  }

  out.push({
    titulo: "Lojas",
    texto: d.plano.personalizado
      ? "O valor foi combinado com a DELIVERY OS para a operação informada. Inclusões ou exclusões de lojas passam a valer na cobrança seguinte."
      : `O valor é calculado pelo número de lojas ativas, no modelo primeira loja + lojas adicionais (preço-base do anual à vista: ${brl(d.plano.precoPrimeiraLoja ?? 0)} pela primeira loja e ${brl(d.plano.precoAdicional ?? 0)} por loja adicional, por mês). Lojas incluídas ou excluídas passam a valer na cobrança seguinte, no ciclo mensal, ou na renovação, nos ciclos anuais — sem cobrança proporcional no período em curso.`,
  })

  if (d.primeiraCobranca) {
    const doze = !d.plano.personalizado && d.ciclo === "anual_12x"
    out.push({
      titulo: doze ? "Primeiro período" : "Primeira cobrança",
      texto: doze
        ? `O primeiro período de 12 meses sai por ${brl(d.primeiraCobranca.valor)} — ${d.parcelas ?? PARCELAS_12X}x de ${brl(Math.round((d.primeiraCobranca.valor / (d.parcelas ?? PARCELAS_12X)) * 100) / 100)} (${d.primeiraCobranca.motivo}). As renovações seguem o valor deste Termo.`
        : `A primeira cobrança sai por ${brl(d.primeiraCobranca.valor)} (${d.primeiraCobranca.motivo}). As seguintes seguem o valor deste Termo.`,
    })
  }

  out.push(
    {
      titulo: "Direito de arrependimento",
      texto: `Nos 7 (sete) dias corridos seguintes à contratação, o CONTRATANTE pode desistir e receber a devolução integral do valor pago${!d.plano.personalizado && d.ciclo === "anual_12x" ? " — no anual em 12x, com o estorno do parcelamento inteiro" : ""}.`,
    },
    {
      titulo: "Reajuste",
      texto:
        "Os valores são reajustados na forma da cláusula 4.4 do Contrato, na data de aniversário da contratação.",
    },
  )

  return out
}
