# O que precisamos da API da Keeta

Escrito em 26/08/26, quando a Keeta perguntou ao Marcus o que ele precisa puxar.

A lista NÃO é um desejo: é exatamente o que o sistema já consome hoje das
planilhas exportadas do portal. São sete relatórios; se a API cobrir os sete, a
importação manual acaba.

A ordem é por valor, não por conveniência. O **repasse** vem primeiro porque é o
único que faz o dinheiro conciliar — foi ele que, em 26/08/26, fechou ao centavo
o saque de R$ 11.085,95 do ciclo 10–16/08 da loja JK.

As perguntas do fim valem tanto quanto os campos. Elas existem porque as duas
integrações anteriores nos custaram caro exatamente nesses pontos:

- **iFood**: a API de Settlements tem um campo `paymentDate` que parece a data
  do depósito e não é — para loja que antecipa, ela devolve o calendário
  original. Descobrimos isso comparando com o extrato bancário do lojista.
- **iFood (de novo)**: a API de antecipações aceita no máximo ~31 dias e, se o
  intervalo passar disso, responde **HTTP 200 com zero itens** — indistinguível
  de "não há nada no período". Perdemos tempo achando que a loja não antecipava.
- **99 Food**: não existe endpoint de relatório agregado, então itens vendidos
  só saem percorrendo pedido a pedido (~5h de chamadas por rede de 15 lojas).

---

**Assunto:** Integração via API — o que precisamos puxar

Olá, tudo bem?

Somos a Lab of Change LTDA, integradora do **Cozina Delivery OS**, um painel de
gestão para donos de delivery: consolidamos faturamento, taxas, repasses e
indicadores de operação das plataformas num lugar só, para o lojista enxergar o
resultado real de cada loja.

Hoje já operamos com lojistas na Keeta, mas por **exportação manual do portal** —
o lojista baixa os relatórios e sobe no nosso sistema. A lista abaixo é
exatamente o que consumimos desses arquivos hoje, em ordem de importância.

**1. Repasse / liquidação** *(o mais importante)*

Por ciclo de faturamento: **período do ciclo**, **data de liquidação**,
**status**, **valor do repasse** e **CNPJ** do recebedor.

É o que permite conciliar com o extrato bancário do lojista. Sem ele, qualquer
número que a gente mostre é reconstrução — e reconstrução não fecha.

**2. Pedido a pedido**

Número do pedido, data/hora do pedido, da conclusão e do cancelamento, status,
turno, **itens do pedido**, ganhos líquidos, valor pago pelo cliente, preço
original, comissão básica, taxa de distância, taxa de pagamento online, taxa de
saque antecipado, promoção Keeta, promoção da loja, ressarcimento da plataforma,
motivo e responsabilidade do cancelamento, tempo de preparo, e a **avaliação**
(nota, comentário, data e resposta).

O detalhe dos **itens dentro do pedido** é o que nenhum relatório agregado dá —
é ele que responde "o que o cliente leva junto".

**3. Diário da loja**

Vendas de itens, pedidos válidos, total e cancelados, valor médio do pedido,
**funil** (alcance, visitantes, adição ao carrinho, clientes que finalizaram e
as taxas de conversão), vendas em promoção, nº de campanhas, tempo aberto e
tempo médio de preparo.

**4. Itens vendidos**

Por item e por período: quantidade vendida, preço médio e o funil do item
(alcance, adição ao carrinho, conversão).

**5. Fatura / taxas do período**

Comissão, taxa de distância, taxa de pagamento online, taxa de saque antecipado,
taxa de serviço mensal, publicidade, subsídio de entrega, ajuste de comissão e
deduções.

**6. Campanhas / promoções**

Por campanha: regra de desconto, pedidos da campanha, pedidos válidos, vendas em
promoção, despesa da campanha e despesa por unidade.

---

**Cinco perguntas sobre a integração**

1. **Como o lojista autoriza o nosso app?** Existe link self-service que a gente
   gera, ou ele autoriza dentro do portal?
2. **Como sabemos que ele autorizou?** Vocês avisam (webhook/callback) ou
   precisamos consultar uma lista de lojas autorizadas?
3. **Existe webhook de pedido**, para recebermos em tempo real em vez de
   consultar de tempos em tempos?
4. **Qual a janela máxima por consulta e o limite de requisições?** E, se a
   janela for excedida, o retorno é **erro** ou uma resposta vazia? Essa
   distinção importa muito para nós: resposta vazia sem erro é indistinguível de
   "não há dado", e já nos custou tempo em outra plataforma.
5. **No repasse, a data informada é a data real do crédito** ou a data prevista?
   Se houver antecipação, elas são o mesmo campo ou campos diferentes?

Obrigado, e ficamos à disposição para o que precisarem do nosso lado.

---

## Contexto para quem for ler a resposta deles

- O que já temos por planilha e as tabelas que cada relatório alimenta:
  `keeta_repasses`, `keeta_pedidos`, `keeta_pedidos_recentes`,
  `keeta_daily_loja`, `keeta_daily_item`, `keeta_fatura_taxas`,
  `keeta_promocoes`.
- Se a resposta cobrir só o item 1, JÁ VALE: o repasse é o que concilia dinheiro
  e é o que a tela de fechamento usa.
- ⚠️ Não prometer ao lojista que a planilha vai sumir antes de a integração
  estar no ar e medida contra o portal, loja a loja. Foi assim que a régua do
  iFood e a do 99 se provaram — e as duas tinham surpresa dentro.
