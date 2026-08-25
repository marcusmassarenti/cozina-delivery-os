# E-mail para a 99 Food — endpoints de relatório

Rascunho escrito em 25/08/26, depois de mapear a árvore inteira da documentação
(`developer-food.99app.com`) e confirmar que **não existe módulo de relatório
ou analytics** no 99Food Protocol. Os módulos são Authorization, Store, Menu
(catálogo), Order, Logistics e Financial — e o Financial tem só `Get Bill Data`
e `Get Settlements Data`.

O pedido abaixo não é bloqueio: já contornamos percorrendo o `Get Order
Details` pedido a pedido. É otimização — e vale perguntar porque o contorno
custa horas de chamada por rede.

**Enviar como Lab of Change LTDA** (CNPJ 38.613.971/0001-92), que é a
integradora que assina a parceria — não como Cozina Foods.

---

**Assunto:** Endpoints de relatório (itens vendidos e indicadores da loja) — app Cozina Delivery OS

Olá, tudo bem?

Somos a Lab of Change LTDA, integradora do app **Cozina Delivery OS**
(`app_id 5764607791719778299`). Operamos um painel de gestão para donos de
delivery: consolidamos faturamento, taxas, repasses e indicadores de operação
das plataformas num lugar só, para o lojista enxergar o resultado real de cada
loja.

Hoje já usamos, e funcionando bem: a **Financial API** (`Get Bill Data` e
`Get Settlements Data`), a **Menu API** (`Get Store Menu Details`) e os
**webhooks de pedido**.

Temos duas perguntas sobre dados que hoje só conseguimos pelo **export manual
do portal**, e que o lojista precisa baixar e nos enviar todo mês.

**1. Itens vendidos por período**

Existe, ou está no roadmap, um endpoint de relatório agregado de itens vendidos
— o equivalente ao export "Dados do item" do portal (item, quantidade vendida,
receita no período)?

Hoje conseguimos reconstruir isso percorrendo pedido a pedido pelo
`Get Order Details`, que devolve a comanda completa. Funciona, mas com o limite
de 10 req/10s isso significa cerca de **5 horas de chamadas** para carregar o
histórico de uma rede de 15 lojas — e o custo cresce linearmente com o número
de pedidos, do nosso lado e do de vocês.

**2. Indicadores da loja e funil por item**

O export "Dados da loja" traz três indicadores que não encontramos em nenhum
endpoint: **avaliação da loja**, **taxa de aceitação** e **tempo médio de
preparo**. E o "Dados do item" traz o funil por item: **alcance**, **adição ao
carrinho** e **conversão**.

Esses números são do lado da plataforma — não dá para derivá-los do pedido.
Existe endpoint para eles, ou está previsto?

Se qualquer um dos dois estiver no roadmap, ter uma ideia de prazo já nos ajuda
a decidir onde investir: hoje mantemos os dois caminhos (API + importação
manual) em paralelo, e o manual é o que trava a experiência do lojista.

Obrigado, e ficamos à disposição.

---

## Contexto para quem for responder a resposta deles

- Se a resposta for "não existe e não está previsto": nada muda. A fila de
  comandas (`/api/cron/ninefood-comandas`) já cobre os itens vendidos, e o
  funil e os indicadores da loja continuam vindo da planilha.
- Se disserem que existe: vale conferir se o endpoint respeita o mesmo
  `auth_token` por loja que já usamos — se sim, é só somar ao sync diário.
- ⚠️ Não prometer ao cliente que a planilha vai sumir até isso estar
  respondido. A régua atual, medida em 25/08/26: a API cobre financeiro e
  cardápio; nota, aceitação, preparo e funil por item **não têm endpoint**.
