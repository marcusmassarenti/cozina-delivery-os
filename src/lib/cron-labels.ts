/**
 * Nome humano de cada rotina automática.
 *
 * Os nomes técnicos (`ifood-sync`, `process-99-webhooks`) continuam existindo
 * — são eles que aparecem no painel da Vercel e nos logs, e trocá-los quebraria
 * o rastro. Aqui só se resolve o que aparece na tela: "process-99-webhooks"
 * não diz a ninguém que aquilo é o que traz os pedidos da 99.
 *
 * Fora do `server-only` de propósito: a tela de saúde é client component.
 */

export type RotinaLabel = {
  titulo: string
  /** O que ela faz, em uma linha, na linguagem de quem usa o sistema. */
  descricao: string
}

export const CRON_LABEL: Record<string, RotinaLabel> = {
  "ifood-sync": {
    titulo: "Financeiro do iFood",
    descricao: "Puxa repasses, taxas e pedidos de todas as lojas conectadas",
  },
  "ifood-review-sync": {
    titulo: "Avaliações do iFood",
    descricao: "Traz nota, comentário e motivo da reclamação de cada pedido",
  },
  "ifood-auto-vincular": {
    titulo: "Conexão de lojas novas",
    descricao: "Fecha sozinha a conexão de quem acabou de autorizar no iFood",
  },
  "ninefood-sync": {
    titulo: "Financeiro da 99 Food",
    descricao: "Puxa o faturamento e o cardápio das lojas na 99",
  },
  "process-99-webhooks": {
    titulo: "Pedidos da 99 Food",
    descricao: "Processa os pedidos que a 99 envia em tempo real",
  },
  "billing-vencimentos": {
    titulo: "Vencimentos e suspensão",
    descricao: "Marca quem atrasou e agenda o corte de acesso",
  },
  "emitir-faturas": {
    titulo: "Emissão de faturas",
    descricao: "Gera a fatura do mês de cada cliente pagante",
  },
  "regua-email": {
    titulo: "E-mails para clientes",
    descricao: "Boas-vindas, fim do teste, recuperação e cobrança",
  },
  "saude-diaria": {
    titulo: "Relatório de saúde",
    descricao: "Este relatório — confere se tudo acima está entregando dado",
  },
  "resumo-semanal": {
    titulo: "Resumo da semana",
    descricao: "Push de segunda com o fechamento da semana anterior",
  },
}

export function rotulo(nome: string): RotinaLabel {
  return CRON_LABEL[nome] ?? { titulo: nome, descricao: "" }
}
