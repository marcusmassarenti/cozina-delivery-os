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

## Fases

### Fase 1 — O ciclo semanal (recomendada para começar)

Preencher sozinho o *"Informe o faturamento da semana"* da tela 6, com o
vencimento que já existe lá.

**Por que primeiro:** não exige nenhuma entidade nova, ataca exatamente o que a
reunião de 25/08 chamou de "prova de burro" (uma pessoa cuja função era copiar e
colar), e é o que a agência produz **toda semana**. Dá pra provar em dias.

- Semana com vencimento por loja (a tela deles já tem "Semana 1 · venc. 22/07")
- Faturamento da semana calculado, não digitado
- Campo de texto do relatório **continua manual** — o julgamento é dele
- Loja sem integração: campo aberto pra digitar, com o rótulo dizendo que ali não temos dado

### Fase 2 — Gestor e carteira

Entidade `gestor` + vínculo com loja. Destrava a tela 1 inteira (carteira,
faturamento por gestor, tempo médio), o filtro por gestor na tela 5, e a
bonificação.

### Fase 3 — Atendimento

Pedido explícito do Marcus: *"abrir o atendimento para deixar gravado cada passo
que é feito na loja"*. Histórico append-only por loja, com autor e data. A tela 5
já mostra "0 atendimento(s) aberto(s)" — o contador precisa de onde sair.

### Fase 4 — Funil de onboarding

Telas 2, 3 e 4. Comercial → sucesso → gestor, com reunião e encaminhamento.
Depende da Fase 2 (o "encaminhar para gestor" precisa que gestor exista).

### Fase 5 — Comercial e Financeiro da agência

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
