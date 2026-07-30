/**
 * MANUAL DO SISTEMA — base de conhecimento de USO do Delivery OS que o Nino
 * consulta pra tirar dúvidas de "como fazer / onde fica / como funciona" em
 * qualquer tela. Diferente do contexto de NÚMEROS (que é dinâmico por conta),
 * isto é o mapa fixo do produto. Mantido conciso e fiel ao que cada tela faz.
 *
 * Sempre que uma tela nova/alteração relevante entrar no sistema, atualize aqui
 * pra o Nino saber explicar.
 */
export const SISTEMA_MANUAL = `
# MANUAL DO DELIVERY OS (como usar o sistema)

## O que é o sistema
O Delivery OS junta o que as lojas vendem no iFood, 99 Food e Keeta e vira relatórios, DRE, fluxo de caixa e alertas — por loja e pra rede toda. O dado entra por IMPORTAÇÃO de relatórios (.xlsx) das plataformas ou por conexão automática (iFood financeiro e 99 Food já sincronizam via API; Keeta é por arquivo).
Menu lateral por seções: Dashboard · Nino AI · Operação (Unidades, Pedidos, Avaliações) · Gestão (Hub de Relatórios, Relatório Diário, DRE Grupo) · Financeiro (Visão Geral, Fluxo de Caixa, Lançamentos, A pagar & receber, Contas, Cartões, Categorias, Cadastros) · Integrações (Importação, Conexões, Ficha Técnica ERP) · Administração (Clientes, Minha conta) · Novidades.
Quase toda tela tem um botão "Como funciona" no topo que abre um passo a passo guiado por cima da própria tela. Há também a Central de Ajuda.

## Primeiros passos (conta nova)
1) Personalize a conta (logo/nome) em Minha conta › Personalização. 2) Cadastre as lojas em Unidades › Nova Unidade. 3) Faça a primeira importação (sugestão: iFood) em Importação. Depois disso Dashboard, Relatórios e DRE já mostram os números. No Dashboard aparece um cartão "Primeiros passos" com o checklist.

## Dashboard (tela inicial, "/")
Resumo da rede no período: faturamento bruto, líquido, pedidos, ticket, cancelamentos, nota média, taxas por plataforma, comparativo entre lojas e ranking. Use o seletor de período no topo pra mudar o intervalo. Adapta o texto pra "rede", "1 loja" ou "várias lojas" conforme a seleção.

## Nino AI ("/nino")
Sou eu. Respondo sobre os NÚMEROS da operação (faturamento, CMV, ticket, cancelamento, taxas, nota, evolução, projeção do mês, comparações entre lojas), sobre o MERCADO (com busca na web) e sobre COMO USAR O SISTEMA (este manual). As conversas ficam salvas na lateral e dá pra favoritar/organizar.

## OPERAÇÃO
### Unidades ("/unidades")
Lista das lojas. Clicando numa loja abre o detalhe do mês com abas: Financeiro (DRE da loja + custos), Cardápio e Avaliações. Cadastrar loja nova: botão "Nova Unidade".
- Custos da loja: na aba Financeiro da unidade você lança os custos por categoria — CMV (mercadoria: carnes, bebidas, descartáveis…) e operacionais (aluguel, folha…). Cadastra a categoria uma vez e preenche o valor a cada mês. A soma entra na DRE (leva ao Resultado).
### Pedidos ("/pedidos")
Acompanhamento dos pedidos por loja e plataforma no período — volume, ticket e cancelamentos. Filtro de plataforma mostra só as habilitadas na loja.
### Avaliações ("/avaliacoes")
As avaliações dos clientes (iFood/99/Keeta) por loja ou rede. Acompanha satisfação, notas por canal e comentários negativos.

## GESTÃO
### Hub de Relatórios ("/relatorios")
Central dos relatórios da rede por categoria. Cada relatório deixa escolher lojas, plataformas e período. Tem: Comparativo loja×loja, Resultado da rede, Acompanhamento, Evolução/crescimento, Ranking de lojas, Faturamento por plataforma, Produtos (top/alta/queda), Comparativo de produtos, Evolução e Comparativo de nota, Comentários negativos, Cancelamentos, Ticket médio, e o link pra Cobertura de importação. Todo relatório tem "← Hub de Relatórios" pra voltar.
### Relatório Diário ("/relatorio-diario")
Desempenho dia a dia da rede no período.
### DRE Grupo ("/dre") — o DRE COMPLETO
DRE consolidado da rede: faturamento bruto → taxas das plataformas → líquido → CMV → custos operacionais → Resultado. Inclui também as "Despesas operacionais (do Caixa)" (aluguel, folha, fixas lançadas no Financeiro), com "Resultado após despesas do Caixa" e ponto de equilíbrio. Vira "DRE da loja" quando é uma só. Resultado negativo em vermelho. Exporta em PDF pelo botão do card. (O antigo "DRE Gerencial" do caixa foi unificado aqui.)

## FINANCEIRO (módulo Caixa — plano Pro)
Gestão financeira da empresa: contas, cartões, categorias, lançamentos, fluxo de caixa. Tem seletor de loja no topo (Consolidado / Rede / cada loja).
### Visão Geral ("/financeiro")
KPIs do período (receita, despesa, balanço, saldo em conta), o card de Fluxo de Caixa (saldo projetado 30d + alerta de ruptura), comparativo por loja, painéis Pagamentos/Recebimentos (clicam pro aging), Curva ABC de despesas, contas e cartões, últimos lançamentos.
### Fluxo de Caixa ("/financeiro/fluxo")
Saldo corrido PROJETADO (30/60/90 dias) juntando contas a pagar/receber + os repasses de delivery previstos (iFood/Keeta). Mostra alerta de ruptura (1º dia que o saldo fica negativo). É projeção — não mexe em lançamento.
### Lançamentos ("/financeiro/lancamentos")
Onde você registra entradas e saídas. Botão "Novo Lançamento": escolha tipo (despesa/receita/transferência), loja, valor, vencimento, conta ou cartão, categoria, cliente/fornecedor, descrição, data de pagamento e tags. Dá pra recorrência mensal e parcelar no cartão. Edição em massa (marcar pago, categorizar, excluir). Uma seção "Em aberto de meses anteriores" mostra contas vencidas de qualquer mês.
- **Importar extrato (OFX):** botão no topo — escolha a conta e suba o arquivo .ofx do banco; vira lançamento (entrada/saída pelo sinal), já conciliado, sem duplicar o que já foi importado.
### A pagar & receber ("/financeiro/a-pagar-receber")
Tudo em aberto por faixa de vencimento: a vencer / vencido 1-30 / 31-60 / 61-90 / +90 dias, dos dois lados, com o vencido em destaque.
### Contas ("/financeiro/contas")
Suas contas bancárias/caixa: saldo inicial, saldo atual (inicial + efetivados), banco, cor. Transferência entre contas é um lançamento tipo "transferência".
### Cartões ("/financeiro/cartoes")
Cartões de crédito com limite, fechamento e vencimento. A COMPRA no cartão não entra no fluxo de caixa — fica na fatura; só o "Pagar fatura" (escolhendo a conta pagadora) vira saída no caixa. Mostra fatura em aberto, limite disponível e parcelas.
### Categorias ("/financeiro/categorias") — plano de contas
As categorias de receita/despesa. Cada uma tem GRUPO DE DRE (Receita, Dedução, CMV, Mão de obra, Fixa, Variável, Investimento) e NATUREZA (fixo/variável) — é isso que destrava margem de contribuição, CMV%, ocupação% e ponto de equilíbrio. Botão "Criar plano de contas padrão de restaurante" pra quem começa do zero. Dá pra editar categoria e escolher ícone/cor.
### Cadastros ("/financeiro/cadastros")
Clientes e fornecedores (PF/PJ), com busca de CNPJ e CEP automática, prazo de pagamento e endereço. Usados no campo Cliente/Fornecedor dos lançamentos.

## INTEGRAÇÕES
### Importação ("/importacao") — como subir relatório
Sobe os .xlsx: iFood (Cardápio / Financeiro-Conciliação / Avaliações / Pedidos), 99 Food (Dados da loja / item / pedido) ou Keeta (Loja diária / Itens / Pedidos). Ao apertar Importar, um passo guiado mostra onde baixar o relatório em cada plataforma. Loja nova no arquivo aparece com botão "Vincular"/"Criar e importar" — vincule à sua unidade e o sistema passa a importar por ela. Veja o que já foi importado em "Cobertura de importação". Dica: o financeiro do iFood e o 99 Food já entram sozinhos via conexão; o import é o caminho pro que não tem API (Keeta, e relatórios de portal do iFood).
### Conexões ("/conexoes")
Onde ficam as integrações automáticas (APIs das plataformas e do ERP) e o botão de sincronizar.
### Ficha Técnica ERP ("/ficha-tecnica")
Converte os itens vendidos em demanda de insumos do ERP no período — liga a venda ao consumo de matéria-prima.

## ADMINISTRAÇÃO
### Clientes ("/clientes") — só dono da plataforma
Visão de dono do SaaS: todos os clientes (empresas), MRR, recebido, a receber, em atraso, status de cobrança, assinaturas Asaas. Clicando no cliente abre o detalhe (dados, cobrança, fiscais, lojas, usuários, pagamentos, NFs). Tem busca, filtro por status, seleção em massa e a aba Analytics.
### Minha conta
- Informações ("/minha-conta/informacoes"): dados do titular (PF/PJ, CPF/CNPJ) e endereço da cobrança/NF; preencha o CEP que busca o endereço.
- Personalização ("/minha-conta/personalizacao"): logo, nome e imagem de login.
- Assinatura ("/minha-conta/assinatura"): plano atual, valor, próxima cobrança, forma de pagamento, histórico e cancelamento. Planos: Essencial, Pro (libera o Financeiro/Caixa) e AI (libera o Nino).
- Usuários ("/minha-conta/usuarios"): cadastra e dá permissão à equipe/franqueados.
- Permissões ("/minha-conta/permissoes"): define o que cada perfil vê e faz por módulo.

## Novidades ("/novidades")
O que mudou no sistema (changelog). Aparece um aviso quando sai versão nova.

## Dúvidas comuns (respostas rápidas)
- "Como importo o financeiro do iFood?" → Importação › suba o relatório de Conciliação (Financeiro) do iFood; o passo guiado mostra onde baixar. (Ou deixe a conexão automática puxar sozinha.)
- "Como lanço uma despesa/receita?" → Financeiro › Lançamentos › Novo Lançamento.
- "Como importo o extrato do banco?" → Lançamentos › Importar extrato (OFX).
- "Onde vejo o lucro/DRE?" → DRE Grupo (rede) ou a aba Financeiro dentro da Unidade (por loja).
- "Como sei se vou ter caixa pro mês?" → Financeiro › Fluxo de Caixa (saldo projetado + alerta de ruptura).
- "O que ainda falta importar?" → Importação › Cobertura de importação.
- "Como cadastro uma loja?" → Unidades › Nova Unidade (ou importe um relatório dela e clique Vincular).
- "Como lanço o CMV/custo da loja?" → Unidades › abra a loja › aba Financeiro › Custos da loja.
- "Não aparece 99/Keeta numa tela" → aquela tela só mostra plataforma que a loja tem habilitada.
`.trim()
