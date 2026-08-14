/**
 * Central de Ajuda — o catálogo de respostas prontas do chat de suporte.
 *
 * Substitui a IA como primeira camada, e a troca é uma melhora, não uma
 * economia: "minhas lojas estão conectadas?" tem resposta EXATA no banco.
 * Passar isso por um modelo é pagar pra transformar um dado certo numa frase
 * que pode sair errada. O modelo só ganharia da lista numa pergunta que
 * ninguém previu — e essa, aqui, vai direto pra uma pessoa.
 *
 * REGRAS DE ESCRITA (valem pra toda resposta nova):
 *  • Responda a pergunta na PRIMEIRA linha. Contexto vem depois.
 *  • Diga de quem é a próxima ação: nossa, do cliente ou da plataforma.
 *  • Nunca prometa prazo que não controlamos. "Depende do iFood" é resposta.
 *  • Nada de "provavelmente". O que não dá pra afirmar vira `→ falar com uma
 *    pessoa`, que é o botão que já existe no fim de toda resposta.
 *
 * `dado` liga a resposta ao retrato da conta (ver suporte-raio-x.ts). Quem
 * resolve isso é `src/lib/suporte/ajuda-dados.ts`, no servidor — este arquivo
 * é texto puro de propósito, pra poder ser lido pelo cliente sem arrastar o
 * banco junto.
 */

/** Respostas que continuam com o dado REAL da conta de quem perguntou. */
export type DadoDaConta =
  | "lojas-conectadas"
  | "ate-quando-entrou"
  | "aguardando-ifood"
  | "revogadas"
  | "plano-e-cobranca"

export type Pergunta = {
  id: string
  titulo: string
  resposta: string
  dado?: DadoDaConta
}

export type Categoria = {
  id: string
  titulo: string
  resumo: string
  perguntas: Pergunta[]
}

export const CATEGORIAS: Categoria[] = [
  {
    id: "conexao",
    titulo: "Conexão de lojas",
    resumo: "iFood, 99 Food, Keeta e Cardápio Web",
    perguntas: [
      {
        id: "conexao.minhas-lojas",
        titulo: "Minhas lojas estão conectadas?",
        resposta:
          "Segue o estado de cada loja neste momento, direto da sua conta:",
        dado: "lojas-conectadas",
      },
      {
        id: "conexao.como-conectar-ifood",
        titulo: "Como conecto uma loja no iFood?",
        resposta:
          "A gente pede a conexão e você aprova no Portal do Parceiro do iFood.\n\nDois detalhes que respondem quase toda dúvida aqui:\n\n1. São DOIS aplicativos pra aprovar — um de faturamento e um de avaliações. Aprovar só um deixa metade dos dados de fora.\n2. Quem aprova precisa ser o usuário Proprietário da conta no iFood. É a causa mais comum de \"não apareceu nada pra aprovar\".\n\nDepois que você aprova, a loja conecta sozinha em até 15 minutos e o histórico entra desde janeiro. Você não precisa avisar a gente.",
      },
      {
        id: "conexao.aguardando",
        titulo: "Pedi a conexão e não conectou. E agora?",
        resposta:
          "Enquanto o iFood não libera do lado deles, não há o que fazer do seu lado nem do nosso — a conexão entra sozinha assim que eles aprovarem.",
        dado: "aguardando-ifood",
      },
      {
        id: "conexao.revogada",
        titulo: "Uma loja parou de trazer dados do nada",
        resposta:
          "Quando o iFood deixa de devolver uma loja que antes vinha, há dois motivos possíveis: alguém removeu o acesso do nosso app no Portal do Parceiro, ou o iFood parou de entregar a loja mesmo com a autorização ativa.\n\nDá pra saber qual é em poucos segundos: no Portal do Parceiro, aba Permissões, procure o CNPJ da loja. Se aparecer \"Aguardando Ativação\", é só aprovar de novo. Se aparecer \"Ativo\", a autorização está de pé e o problema é do lado deles — nesse caso use o botão abaixo que a gente abre o chamado.",
        dado: "revogadas",
      },
      {
        id: "conexao.keeta",
        titulo: "A Keeta conecta por API?",
        resposta:
          "Não. A Keeta não abre API pra parceiro, então os dados dela entram por planilha — é a única plataforma em que isso não tem como ser automático hoje.\n\niFood, 99 Food e Cardápio Web conectam por API e atualizam sozinhos, todo dia.",
      },
    ],
  },
  {
    id: "dados",
    titulo: "Dados e importação",
    resumo: "O que entra sozinho, o que é planilha",
    perguntas: [
      {
        id: "dados.ate-quando",
        titulo: "Até que dia entrou dado nas minhas lojas?",
        resposta: "Último dia com movimento registrado em cada loja:",
        dado: "ate-quando-entrou",
      },
      {
        id: "dados.itens-vendidos",
        titulo: "Por que o item vendido não entra sozinho?",
        resposta:
          "Porque o iFood e a Keeta não entregam item por API — só o total do pedido. Não é uma pendência nossa: o endereço pra pedir esse dado não existe do lado deles.\n\nPor isso o relatório de itens vendidos ainda é planilha nessas duas. Na 99 Food o item já vem sozinho.\n\nÉ o que segura o CMV automático, e é a primeira coisa que a gente liga se o iFood abrir esse dado.",
      },
      {
        id: "dados.numero-diferente",
        titulo: "Um número aqui está diferente do portal da plataforma",
        resposta:
          "Antes de tratar como erro, vale conferir dois pontos que explicam a maioria dos casos:\n\n• O faturamento bruto aqui inclui os pedidos cancelados, igual o portal do iFood mostra. Se você estiver comparando com um número que já desconta cancelamento, a diferença é essa.\n• O vale-refeição já está dentro do repasse. Somá-lo à parte infla o total.\n\nSe não for nenhum dos dois, é caso pra gente olhar junto — o botão no fim desta resposta chama uma pessoa.",
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro e repasses",
    resumo: "Repasse, taxas, cancelamento, custo",
    perguntas: [
      {
        id: "financeiro.repasse",
        titulo: "Como o repasse é calculado?",
        resposta:
          "Sai do faturamento bruto e chega no que cai na conta, nesta ordem:\n\nbruto → (−) pedidos cancelados → (−) taxas da plataforma → (−) o que você já recebeu direto na entrega (dinheiro e maquininha) → repasse.\n\nA tela da loja mostra essa conta linha a linha, na aba Financeiro. O número não é estimado: vem do extrato da própria plataforma.",
      },
      {
        id: "financeiro.cancelamento",
        titulo: "Como o cancelamento aparece na conta?",
        resposta:
          "A perda de um cancelamento é o valor da cesta — o pedido inteiro que deixou de existir, não uma taxa de estorno.\n\nPor isso o bruto aparece com os cancelados dentro (é a leitura do portal) e a perda é mostrada separada. Somar as duas coisas contaria o mesmo prejuízo duas vezes.",
      },
      {
        id: "financeiro.cmv",
        titulo: "Como faço o controle de CMV?",
        resposta:
          "Pela ficha técnica: você cadastra a receita de cada produto e o sistema cruza com o que foi vendido.\n\nO ponto que trava hoje é a venda por item, que o iFood e a Keeta não entregam por API — nessas duas, o item precisa vir de planilha. Enquanto isso, o custo por loja também pode ser lançado direto em Lançamentos.",
      },
    ],
  },
  {
    id: "conta",
    titulo: "Conta, plano e cobrança",
    resumo: "Plano, nota fiscal, acesso e senha",
    perguntas: [
      {
        id: "conta.meu-plano",
        titulo: "Qual é o meu plano e quando vence?",
        resposta: "Situação da sua assinatura agora:",
        dado: "plano-e-cobranca",
      },
      {
        id: "conta.trocar-plano",
        titulo: "Como troco de plano?",
        resposta:
          "Em Minha conta → Assinatura. A troca vale na hora e a diferença é calculada proporcional aos dias que faltam do ciclo — você não paga o mês cheio de novo.",
      },
      {
        id: "conta.nota-fiscal",
        titulo: "Onde pego a nota fiscal?",
        resposta:
          "A nota é emitida sozinha a cada pagamento e o link chega no e-mail da cobrança. As anteriores ficam em Minha conta → Assinatura, junto do histórico de pagamentos.",
      },
      {
        id: "conta.senha-2fa",
        titulo: "Senha e verificação em duas etapas",
        resposta:
          "A senha se troca em Minha conta → Informações, e é lá também que fica a verificação em duas etapas — opcional, com 8 códigos de recuperação pra guardar.\n\nSe você perdeu o acesso e não consegue entrar pra chegar nessa tela, o botão abaixo chama uma pessoa: reset de duas etapas a gente faz do nosso lado.",
      },
    ],
  },
]

export function acharPergunta(id: string): Pergunta | null {
  for (const c of CATEGORIAS) {
    const p = c.perguntas.find((q) => q.id === id)
    if (p) return p
  }
  return null
}
