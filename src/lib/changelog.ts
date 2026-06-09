/**
 * Changelog do sistema (Novidades & Atualizações).
 *
 * COMO REGISTRAR UMA ATUALIZAÇÃO: a cada deploy, adicione um novo objeto
 * Release NO TOPO do array CHANGELOG (a lista é da versão mais nova para a
 * mais antiga). Sem banco — é versionado junto com o código.
 *
 * `kind` de cada item: "novo" (recurso novo), "melhoria" (algo ficou melhor)
 * ou "correcao" (bug consertado). Use `antes`/`depois` quando fizer sentido
 * mostrar a comparação (vira um item expansível na tela).
 */

export type ChangeKind = "novo" | "melhoria" | "correcao"

export type ChangeItem = {
  kind: ChangeKind
  title: string
  /** texto curto (quando não precisa de antes/depois) */
  desc?: string
  antes?: string
  depois?: string
}

export type ChangeArea = {
  area: string
  items: ChangeItem[]
}

export type Release = {
  version: string
  date: string // ISO yyyy-mm-dd
  tag?: string // ex.: "Grande novidade", "Melhorias", "Correções"
  title: string
  summary?: string
  areas: ChangeArea[]
}

export const CHANGELOG: Release[] = [
  {
    version: "1.2.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Cobrança por loja na plataforma",
    summary:
      "Agora dá pra cobrar uma licença base + um adicional por loja — e acompanhar tudo (pagamentos e lojas).",
    areas: [
      {
        area: "Clientes da plataforma",
        items: [
          {
            kind: "novo",
            title: "Cobrança: base + valor por loja",
            antes:
              "A mensalidade era um valor fixo por cliente, ajustado na mão sempre que mudava o número de lojas.",
            depois:
              "Defina valor base + valor por loja extra + quantas lojas já vêm inclusas. O total e o MRR sobem sozinhos quando o cliente ganha uma loja.",
          },
          {
            kind: "novo",
            title: "Histórico de pagamentos",
            desc: "Registre cada pagamento recebido (data, valor, forma) e veja o histórico do cliente num lugar só.",
          },
          {
            kind: "novo",
            title: "Ver as lojas do cliente",
            desc: "Clique no número de lojas pra ver quais são — nome, cidade e se está ativa.",
          },
          {
            kind: "melhoria",
            title: "Valores sempre com centavos",
            antes: "O campo de valor mostrava só '99'.",
            depois: "Agora formata pra 'R$ 99,00' automaticamente ao sair do campo.",
          },
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Fluxo de Caixa multi-loja",
    summary:
      "O caixa agora separa por loja: o franqueador vê tudo e compara, o franqueado vê só a dele.",
    areas: [
      {
        area: "Fluxo de Caixa",
        items: [
          {
            kind: "novo",
            title: "Seletor de loja",
            desc: "Um seletor no topo: 'Consolidado' mostra a rede inteira; escolha uma loja pra ver só ela.",
          },
          {
            kind: "novo",
            title: "Loja no lançamento",
            antes: "Os lançamentos não sabiam a que loja pertenciam.",
            depois:
              "Cada lançamento nasce carimbado numa loja, puxada automaticamente da conta escolhida.",
          },
          {
            kind: "novo",
            title: "Comparativo das lojas",
            desc: "No Consolidado, uma tabela compara as lojas lado a lado: saldo, a pagar, a receber e resultado.",
          },
          {
            kind: "melhoria",
            title: "Acesso do franqueado",
            depois: "O franqueado entra e vê/lança só o caixa da loja dele.",
            antes: "Sem separação de acesso por loja no caixa.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Novo módulo: Fluxo de Caixa",
    summary: "Um módulo financeiro completo pra controlar contas a pagar e a receber.",
    areas: [
      {
        area: "Fluxo de Caixa",
        items: [
          {
            kind: "novo",
            title: "Contas, cartões e categorias",
            desc: "Cadastre contas bancárias (com logo do banco), cartões de crédito e categorias com ícones.",
          },
          {
            kind: "novo",
            title: "Lançamentos com fatura de cartão",
            desc: "Despesas, receitas e transferências. Compras no cartão entram na fatura e parcelam entre faturas.",
          },
          {
            kind: "novo",
            title: "Cadastros de clientes e fornecedores",
            desc: "Com busca de CEP e consulta de CNPJ automáticas.",
          },
          {
            kind: "novo",
            title: "Dashboard financeiro",
            desc: "Saldos, vencimentos, maiores gastos/receitas e top clientes/fornecedores.",
          },
        ],
      },
    ],
  },
]
