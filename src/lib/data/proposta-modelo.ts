import "server-only"

/**
 * Os textos PADRÃO da proposta comercial — e o que fazer quando não existem.
 *
 * ── DE ONDE VEIO ESTE CONTEÚDO ───────────────────────────────────────────
 * De uma comparação linha a linha com a proposta da Mercos (o PDF que o Marcus
 * subiu em 14/08/26). A minha versão era um orçamento bonito e não fechava
 * negócio: faltavam as quatro peças que transformam um PDF em vínculo —
 * escopo item a item, termo de aceite, referência ao contrato e campos de
 * assinatura — além do cronograma, dos contatos de boleto/NF e do "como
 * contratar mais lojas depois".
 *
 * ⚠️ OS PADRÕES FICAM AQUI, NO CÓDIGO, mas a tabela MANDA.
 *
 * Parece redundante e não é. Se o texto vivesse só no banco, uma proposta
 * emitida antes de alguém preencher o modelo sairia com buracos — e o buraco
 * numa proposta comercial é justamente a cláusula que faltava pra cobrar. Se
 * vivesse só no código, mudar uma vírgula exigiria deploy, e na prática viraria
 * "deixa como está".
 *
 * Então: o código garante que a proposta NUNCA sai vazia, e a tela sobrescreve
 * quando o Marcus quiser outro texto.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export type ItemEscopo = {
  recurso: string
  /** Em quais planos entra. Vazio = não entra em nenhum (fica com "–"). */
  planos: ("essencial" | "pro" | "ai")[]
}

export type ModeloProposta = {
  escopoItens: ItemEscopo[]
  atendimento: string
  termoAceite: string
  contratoUrl: string
  faturamento: string
  contratarMais: string
  treinamentoPrazo: string
  rodapeValores: string
}

/**
 * O escopo item a item foi a lacuna mais séria da minha proposta.
 *
 * A Mercos lista ~40 recursos e marca com "–" os que NÃO entram no plano
 * contratado. Sem essa lista, "eu achei que tinha relatório de X" vira
 * discussão no quarto mês — e a discussão é sempre com quem já está pagando.
 *
 * A lista abaixo é o que o sistema faz hoje, agrupada como o cliente pensa
 * (dado que entra → o que ele vê → o que ele faz), não como o código é
 * organizado.
 */
const ESCOPO_PADRAO: ItemEscopo[] = [
  { recurso: "Integração automática com iFood (faturamento, pedidos, avaliações)", planos: ["essencial", "pro", "ai"] },
  { recurso: "Integração automática com 99 Food (faturamento, cardápio)", planos: ["essencial", "pro", "ai"] },
  { recurso: "Integração com Cardápio Web", planos: ["essencial", "pro", "ai"] },
  { recurso: "Importação por planilha (Keeta e demais relatórios)", planos: ["essencial", "pro", "ai"] },
  { recurso: "Usuários ilimitados", planos: ["essencial", "pro", "ai"] },
  { recurso: "Dashboard consolidado da rede", planos: ["essencial", "pro", "ai"] },
  { recurso: "Faturamento, taxas, cancelamentos e ticket médio por loja", planos: ["essencial", "pro", "ai"] },
  { recurso: "Avaliações e nota por loja, com resposta pelo sistema", planos: ["essencial", "pro", "ai"] },
  { recurso: "Relatório diário por e-mail", planos: ["essencial", "pro", "ai"] },
  { recurso: "Suporte por chat dentro do sistema", planos: ["essencial", "pro", "ai"] },
  { recurso: "DRE por loja e da rede", planos: ["pro", "ai"] },
  { recurso: "Fluxo de caixa e contas a pagar/receber", planos: ["pro", "ai"] },
  { recurso: "Ficha técnica e CMV", planos: ["pro", "ai"] },
  { recurso: "Comparativo entre lojas e ranking da rede", planos: ["pro", "ai"] },
  { recurso: "Relatórios de qualidade, promoções e Super (iFood)", planos: ["pro", "ai"] },
  { recurso: "Diagnóstico da loja com plano de ação", planos: ["pro", "ai"] },
  { recurso: "Nino AI — consultor com os números da sua rede", planos: ["ai"] },
  { recurso: "Diagnóstico gerado por inteligência artificial", planos: ["ai"] },
  { recurso: "Análise de concorrência por região", planos: [] },
  { recurso: "Aplicativo para celular (iOS/Android)", planos: [] },
]

export const MODELO_PADRAO: ModeloProposta = {
  escopoItens: ESCOPO_PADRAO,
  atendimento:
    "Suporte por chat dentro do sistema e por e-mail (suporte@deliveryos.food), de segunda a sexta, das 9h às 18h, exceto feriados nacionais. Pode ser acionado por qualquer usuário da conta.",
  // ⚠️ Este parágrafo é o que transforma o PDF em compromisso. Sem ele, a
  // proposta é orçamento: informa preço e não vincula ninguém a nada.
  termoAceite:
    'O "De Acordo" nesta proposta vincula as partes ao cumprimento das condições aqui descritas, representa a autorização do CLIENTE para o início das atividades e o compromisso pelo pagamento dos valores devidos. O CLIENTE declara que é representado neste ato por seu(s) representante(s) legal(is).',
  contratoUrl: "https://www.deliveryos.food/contrato",
  faturamento:
    "A cobrança tem início na contratação. A fatura é emitida no primeiro dia de cada mês, com vencimento conforme o dia escolhido, e a NFS-e é emitida automaticamente. Pagamento por cartão de crédito, boleto ou PIX.",
  contratarMais:
    "A inclusão de novas lojas é feita pelo próprio sistema e passa a ser cobrada proporcionalmente a partir da ativação, mantidas as condições comerciais desta proposta. A exclusão de lojas vale a partir do ciclo seguinte.",
  treinamentoPrazo:
    "O treinamento incluído deve ser realizado em até 90 dias da assinatura. Passado esse prazo, é contratado à parte.",
  rodapeValores:
    "Os valores podem variar conforme o número de lojas ativas. Alterações de plano ou de escopo são formalizadas em nova proposta comercial. As datas de vencimento não dependem da efetiva utilização do sistema.",
}

/** O modelo salvo, com o padrão do código preenchendo o que estiver em branco. */
export async function getModeloProposta(): Promise<ModeloProposta> {
  const { data } = await createAdminClient()
    .from("propostas_modelo")
    .select("*")
    .maybeSingle()
  if (!data) return MODELO_PADRAO

  const r = data as Record<string, unknown>
  const itens = r.escopo_itens as ItemEscopo[] | null
  return {
    // Campo em branco cai no padrão, um a um: um modelo salvo pela metade não
    // pode produzir uma proposta pela metade.
    escopoItens: itens && itens.length > 0 ? itens : MODELO_PADRAO.escopoItens,
    atendimento: (r.atendimento as string) || MODELO_PADRAO.atendimento,
    termoAceite: (r.termo_aceite as string) || MODELO_PADRAO.termoAceite,
    contratoUrl: (r.contrato_url as string) || MODELO_PADRAO.contratoUrl,
    faturamento: (r.faturamento as string) || MODELO_PADRAO.faturamento,
    contratarMais: (r.contratar_mais as string) || MODELO_PADRAO.contratarMais,
    treinamentoPrazo:
      (r.treinamento_prazo as string) || MODELO_PADRAO.treinamentoPrazo,
    rodapeValores: (r.rodape_valores as string) || MODELO_PADRAO.rodapeValores,
  }
}
