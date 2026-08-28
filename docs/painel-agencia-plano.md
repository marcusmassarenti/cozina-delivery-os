# Painel da Agência — plano

Baseado nas **8 telas** do `dgfoods-control-saas.vercel.app`, o sistema que o
Diego (DG Foods) construiu e **parou de usar quando o Delivery OS ficou pronto**
— e na reunião de 25/08/26 com o gestor da Prime Gestão (~380 lojas).

> ⚠️ Este documento existe porque a primeira versão deste plano se perdeu numa
> conversa. Prints não sobrevivem à compactação; arquivo sobrevive.

---

## A frase que organiza tudo

**O painel deles tem a OPERAÇÃO e nenhum dado. O nosso tem o DADO e nenhuma
operação.**

A prova está na tela 6: o campo *"Informe o faturamento da semana"* é digitado à
mão, e as lojas novas mostram "Média 3 meses: R$ 0,00". Eles não têm o número.
**Nós temos.** E na tela 5 aparecem **183 lojas** contra 75 conectadas conosco —
o painel precisa comportar loja sem integração, senão metade da carteira some.

Não estamos construindo um painel novo. Estamos preenchendo os campos vazios do
painel que já existe.

---

## O que cada tela é

| # | Tela | O que faz |
|---|---|---|
| 1 | **Gestores** | Carteira por gestor (32/32 lojas), faturamento que cada um traz, tempo médio de permanência. Existe pra virar **bonificação**. |
| 2 | **Sucesso do Cliente** | Funil de onboarding com três papéis: **comercial** (vendeu) → **sucesso** (alinha) → **gestor** (cuida). |
| 3-4 | **Modal de onboarding** | Responsável, status, reunião com Meet, evento no Google Agenda, observações. "Encaminhar para gestor" só libera ao concluir. |
| 5 | **Lojas** | 183 lojas por etapa (Checklist → Cardápio), filtros por gestor e plataforma. |
| 6 | **Detalhe da loja** | KPIs (acumulado, média 3m, meta 30d, total 90d, promessa comercial) + **Fluxo** (Etapa 1 → Etapa 2 → Encaminhamento) + **Resultado e Relatório Semanal com vencimento**. |
| 7 | **Dashboard Comercial** | Ranking de vendedores do mês, ticket médio — "competição sadia". |
| 8 | **Financeiro** | Projetado semanal e mensal, despesas da agência, sobra do mês, recebido/pendente/atrasado. |

---

## O que já temos e o que é estrutura nova

| Conceito | Estado |
|---|---|
| Faturamento acumulado, média 3m, meta 30d, total 90d | ✅ calculamos |
| **Resultado semanal por loja** | ✅ **calculamos — e lá é digitado à mão** |
| Conteúdo do relatório semanal e mensal | ✅ temos o dado; ❌ falta o formato |
| Lista de lojas com filtro | ⚠️ parcial (`/unidades`) |
| **Gestor com carteira e desempenho** | ❌ estrutura nova |
| **Funil de onboarding (3 papéis)** | ❌ estrutura nova |
| **Estado operacional da loja** (checklist, cardápio, etapa) | ❌ estrutura nova |
| **Atendimento** (histórico do que foi feito) | ❌ estrutura nova |
| Ranking comercial (vendas da agência) | ❌ estrutura nova |
| **Financeiro DA AGÊNCIA** | ⚠️ nosso Financeiro é o P&L do **lojista**. O deles é o da **agência** (mensalidade − despesa). São coisas diferentes. |

---

## As telas, uma a uma

Legenda de origem do dado:
**✅ nosso** (já calculamos) · **✏️ digitado** (julgamento humano) · **🆕 novo**
(estrutura que não existe) · **⚠️ pode faltar** (loja sem integração)

---

### T1 · Visão da carteira
*A primeira tela. Responde: "como está minha carteira hoje?"*

| Bloco | Conteúdo | Origem |
|---|---|---|
| Faixa de KPIs | Lojas ativas · Faturamento acumulado · Média por loja · Tempo médio de permanência | ✅ nosso · 🆕 permanência |
| Metas | Quantas bateram a meta de 30 dias | 🆕 meta por loja |
| Precisa de atenção | Loja caindo, sem dado há N dias, atendimento parado, semana vencida | ✅ nosso |
| Semana corrente | Quantos relatórios semanais estão pendentes e quantos vencem hoje | 🆕 ciclo |

⚠️ **Tempo médio de permanência** é o número mais valioso e o que não temos: ele
mede churn da agência. Precisa de data de entrada da loja na carteira, que é
diferente da data de inauguração.

---

### T2 · Lojas (a carteira)
*Responde: "onde cada loja está no processo?"*

- **Categorias por etapa**, como no painel deles: Lojas Novas → Ativas
  (Etapa 1 Checklist · Etapa 2 Cardápio) 🆕
- **Filtros**: gestor 🆕 · plataforma ✅ · status ✅ · ordenação (novas primeiro)
- **Cartão por loja**: nome, plataforma, gestor 🆕, tempo de casa 🆕, promessa
  comercial 🆕, média 3 meses ✅⚠️, estado do checklist 🆕, atendimentos
  abertos 🆕
- **Busca** por nome (o seletor com busca que já construímos serve de base)

⚠️ Loja sem integração entra na lista igual. O cartão dela mostra **"sem dado
importado"**, nunca R$ 0,00 — a distinção entre *não vendeu* e *não sabemos* é a
regra que este projeto mais violou.

---

### T3 · Loja — detalhe
*A tela onde o gestor trabalha. É a mais importante das oito.*

**Cabeçalho** — loja, plataforma, gestor, entrada na carteira, tempo em gestão.

**KPIs** — Faturamento acumulado ✅ · Média dos últimos 3 meses ✅ · Meta 30
dias 🆕 · Total 90 dias ✅ · Promessa comercial 🆕 · Status ✅

**Fluxo da loja** 🆕 — Etapa 1 Checklist → Etapa 2 Cardápio → Encaminhamento
para Ativas. Cada etapa com quem concluiu e quando. O botão de encaminhar só
libera com as duas etapas fechadas, como no painel deles.

**Ciclo semanal** — o coração:

| Campo | Origem |
|---|---|
| Semana e vencimento | 🆕 (deles: "Semana 1 · venc. 22/07") |
| **Faturamento da semana** | ✅ **nosso — lá é digitado à mão** |
| Pedidos, ticket médio, comparação com a semana anterior | ✅ nosso |
| **Texto do relatório** | ✏️ digitado — o julgamento é do gestor |
| Situação | pendente · entregue · vencida 🆕 |

**Atendimentos** 🆕 — histórico do que foi feito, em ordem, com autor e data.

---

### T4 · Gestores
*Responde: "quem cuida do quê, e quanto cada um traz?"*

- Ranking por faturamento da carteira ✅
- Lojas ativas / total por gestor 🆕
- Tempo médio de permanência das lojas dele 🆕
- Comparativo visual entre gestores ✅
- **Bonificação**: regra configurável (% sobre faturamento, meta batida,
  permanência) 🆕 — é o motivo declarado da tela existir
- Relatórios semanais entregues no prazo 🆕 — mede o trabalho, não só o resultado

---

### T5 · Onboarding (Sucesso do Cliente)
*Responde: "quem entrou e ainda não começou a ser atendido?"*

Fila com **três papéis distintos**: comercial (vendeu) → sucesso (alinha) →
gestor (cuida). Colunas: cliente, loja, comercial, promessa, responsável de
sucesso, status, reunião.

**Ficha de onboarding** 🆕 — responsável, status (Pronto para agendamento →
Reunião agendada → Onboarding concluído), data/hora, link da reunião,
observações, e **encaminhar para gestor** liberado só ao concluir.

⚠️ **Credenciais do cliente não entram em campo de observação.** Se for preciso
guardar acesso, vai em cofre com quem pode ler registrado — não em textarea.
Ver o bloco de riscos.

---

### T6 · Atendimentos
*Pedido direto: "deixar gravado cada passo que é feito na loja".*

- Abertura com tipo (ajuste de cardápio, promoção, contato com o lojista…) 🆕
- Histórico **append-only** — passo, autor, data. Não se edita o passado 🆕
- Aberto / resolvido, com tempo em aberto 🆕
- Visível na T3 e contado na T2

---

### T7 · Comercial
*Responde: "quem vendeu mais este mês?" — a competição sadia.*

- Pódio do mês e ranking por vendedor 🆕
- Vendas fechadas, faturamento, ticket médio 🆕
- Evolução mês a mês 🆕

⚠️ Aqui "faturamento" é **mensalidade vendida pela agência**, não faturamento de
loja. Nome igual, coisa diferente — se confundir uma com a outra, a tela mente.

---

### T8 · Financeiro da agência
*O P&L da agência. **Não** é o financeiro do lojista que já existe.*

- Projetado semanal e mensal 🆕
- Recebido · pendente · atrasado 🆕
- Despesas da agência por categoria, com vencimento e pagamento 🆕
- Sobra do mês = recebido − despesas 🆕

⚠️ Modelo próprio. Reaproveitar o financeiro atual seria erro de modelagem:
aquele responde "quanto sobrou pra loja depois das taxas da plataforma"; este
responde "quanto sobrou pra agência depois das despesas dela".

---

## Fases

### Fase 1 — O ciclo semanal · parte de **T3** (recomendada para começar)

Preencher sozinho o *"Informe o faturamento da semana"* da tela 6, com o
vencimento que já existe lá.

**Por que primeiro:** não exige nenhuma entidade nova, ataca exatamente o que a
reunião de 25/08 chamou de "prova de burro" (uma pessoa cuja função era copiar e
colar), e é o que a agência produz **toda semana**. Dá pra provar em dias.

- Semana com vencimento por loja (a tela deles já tem "Semana 1 · venc. 22/07")
- Faturamento da semana calculado, não digitado
- Campo de texto do relatório **continua manual** — o julgamento é dele
- Loja sem integração: campo aberto pra digitar, com o rótulo dizendo que ali não temos dado

### Fase 2 — Gestor e carteira · **T4**, e o filtro de **T2**

Entidade `gestor` + vínculo com loja. Destrava a tela 1 inteira (carteira,
faturamento por gestor, tempo médio), o filtro por gestor na tela 5, e a
bonificação.

### Fase 3 — Atendimento · **T6**

Pedido explícito do Marcus: *"abrir o atendimento para deixar gravado cada passo
que é feito na loja"*. Histórico append-only por loja, com autor e data. A tela 5
já mostra "0 atendimento(s) aberto(s)" — o contador precisa de onde sair.

### Fase 4 — Funil de onboarding · **T5**

Telas 2, 3 e 4. Comercial → sucesso → gestor, com reunião e encaminhamento.
Depende da Fase 2 (o "encaminhar para gestor" precisa que gestor exista).

### Fase 5 — Comercial e Financeiro da agência · **T7** e **T8**

Telas 7 e 8. São o P&L e o funil de vendas **da agência**, não do lojista —
modelo próprio, sem reaproveitar o financeiro atual.

---

## Riscos anotados agora, não depois

⚠️ **Senha em campo de observação.** O Marcus descreveu (tela 3-4) colocar
usuário e senha do cliente nas observações pra o gestor saber o que foi tratado.
Em claro no banco, em qualquer log, e vaza junto se a tela vazar. Se entrar no
escopo, precisa de desenho próprio — não é textarea.

⚠️ **Escala.** 183 lojas no painel do Diego; **380–500 de UM cliente** na Prime
Gestão; 123 na base inteira hoje. Tudo aqui precisa ser desenhado pra 500, e as
telas que hoje somam em JS não aguentam (ver a nota de performance do projeto).

⚠️ **Loja sem integração é maioria.** 183 contra 75. Toda tela precisa distinguir
"não vendeu" de "não temos dado" — o defeito recorrente desta base.

⚠️ **Multi-tenant.** Isto é para a agência ver a carteira DELA. Gestor, funil e
atendimento são por holding, e o vazamento entre clientes é o erro mais caro que
este sistema pode cometer.

---

## Onde ficam T1 e T2

Não têm fase própria de propósito: elas são a **soma das outras**. A carteira
(T2) ganha coluna a cada fase — gestor na 2, atendimento na 3, etapa do
onboarding na 4. A visão geral (T1) só faz sentido quando existe o que resumir.

Construir as duas primeiro seria montar a moldura antes do quadro: elas ficariam
bonitas e vazias, e cada fase seguinte exigiria mexer nelas de novo.

---

## Como eu proporia medir se deu certo

Não por tela entregue — por trabalho manual que desapareceu.

| Fase | O que precisa acontecer |
|---|---|
| 1 | O gestor abre a loja na quarta e o faturamento da semana **já está lá**. Ninguém abre o portal da plataforma. |
| 2 | O Diego consegue dizer quanto cada gestor traz **sem montar planilha**. |
| 3 | Uma loja que caiu tem histórico do que já foi tentado, escrito por quem tentou. |
| 4 | Loja vendida chega ao gestor com a reunião registrada, sem ninguém lembrar de avisar. |
| 5 | A agência sabe a sobra do mês sem abrir outro sistema. |

A Fase 1 é a única que dá pra provar em dias. As outras exigem estrutura nova, e
estrutura nova cobrada em semana vira dívida.
