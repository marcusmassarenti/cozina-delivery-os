# Integração automática iFood — Plano

> Objetivo: substituir o **upload manual** dos relatórios iFood por **ingestão
> automática via API**, alimentando as tabelas que já existem
> (`ifood_pedidos`, `ifood_financeiro_lancamentos`, `ifood_avaliacoes`,
> `ifood_cardapio_*`). O import manual continua existindo como fallback.

Decisão (2026-06): começar pelo **iFood** (maior volume + API mais completa).
99 Food e Keeta entram depois numa camada Open Delivery comum (operacional).

---

## 1. Por que iFood primeiro

As 3 plataformas se dividem em dois mundos:

| | iFood | 99 Food | Keeta |
|---|---|---|---|
| Tipo | API própria madura (BI + operacional) | Open Delivery (operacional) | Open Delivery (operacional) |
| Pedidos ao vivo | ✅ Order module | ✅ events:polling | ✅ events:polling |
| Cardápio/itens | ✅ Catalog | ✅ | ✅ |
| **Financeiro/repasse** | ✅✅ Settlements, Financial Events, Reconciliation, Sales | ❌ fora do padrão | ❌ fora do padrão |
| **Avaliações** | ✅✅ Reviews (nota, comentário, responder, score) | ❌ | ❌ |
| Auth | OAuth2 (centralizado ou distribuído) | OAuth2 Open Delivery | OAuth2 Open Delivery |
| Acesso | Portal developer.ifood.com.br + homologação | Portal developer-food.99app.com | E-mail KeetaAPI.integrations@keetainc.com |

→ **iFood automatiza os 4 relatórios de uma vez** (financeiro, avaliações,
cardápio, pedidos). 99/Keeta só automatizam o operacional; avaliações e
repasse oficial dessas duas continuam via relatório manual.

---

## 2. Módulos iFood que vamos consumir

1. **Authentication** — OAuth2.
   `POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token`
   - ✅ **DECIDIDO (2026-06): modelo CENTRALIZADO.** Toda a rede está sob uma
     conta iFood corporativa (holding). Logo:
     `grant_type=client_credentials` com **um único** `clientId`+`clientSecret`
     (guardados em **env var** da Vercel, server-only — não vão pro banco nem
     pro client). Token expira em ~6h, renovado por demanda. **Sem** o fluxo
     `userCode`/`authorization_code` por loja.
   - As lojas continuam tendo cada uma seu `merchant_id` no iFood; o app
     central acessa todos. Guardamos só o **mapa** `unit_id ↔ merchant_id`
     (não há token por loja).

2. **Order module** — pedido a pedido. Substitui o relatório de **Pedidos**
   (forma de pagamento, VR, itens, valores, entrega, cliente).
   - `GET /events:polling` → lista de eventos de pedido (novos/status)
   - `POST /events/acknowledgment` → confirma cada evento (senão volta)
   - `GET /orders/{id}` → detalhe completo
   - Recebimento por **polling** ou **webhook**.

3. **Financial module** — substitui a **Conciliação** manual.
   - **Settlements** → valor líquido transferido pra loja (o repasse real)
   - **Financial Events** → fluxo de caixa completo do período de repasse
   - **Reconciliation** → mesma info em CSV
   - **Sales / Anticipations** → vendas e antecipações
   - Granularidade: por período de repasse.

4. **Reviews module** — substitui o relatório de **Comentários e avaliações**.
   - Lista avaliações dos últimos dias (nota, comentário, data, pedido)
   - Score/nota da loja; responder comentários (opcional pra nós).

5. **Catalog** (opcional) — itens/cardápio. Já derivamos itens dos pedidos,
   então fica como "nice to have".

---

## 3. Arquitetura (Vercel + Supabase)

- **Credenciais (centralizado)**: `IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET`
  em **env var** da Vercel (server-only). O access token (6h) fica em cache em
  memória/Supabase com `expires_at` e é renovado por demanda. Nova tabela
  apenas pro **mapa** `ifood_merchant_map` (`unit_id`, `merchant_id`) — sem
  token por loja, porque é uma conta só.

- **Pedidos (tempo real)**:
  - **Opção A — Vercel Cron + polling (recomendada p/ começar):** cron a cada
    X min → `/events:polling` → `acknowledgment` → `GET order` → upsert em
    `ifood_pedidos`. Simples, sem expor endpoint público.
  - **Opção B — Webhook:** rota pública `/api/webhooks/ifood` com verificação
    de assinatura. Mais "ao vivo", mais superfície de ataque. Fica pra depois.

- **Financeiro (diário/periódico)**: cron diário → Settlements + Financial
  Events por período → upsert em `ifood_financeiro_lancamentos`. Concilia o
  repasse real (`impacto_no_repasse`).

- **Avaliações (diário)**: cron diário → Reviews últimos dias → upsert em
  `ifood_avaliacoes`.

- **Dedupe**: por `order_id` / `event_id` / `review_id` / `settlement_id`
  (mesmo padrão dos parsers atuais).

- **Token refresh**: job que renova antes de expirar (6h no centralizado;
  `refresh_token` no distribuído).

- **Cuidados Vercel já conhecidos**: `maxDuration` nas rotas pesadas; chunking
  de `.in()`; paginação com `.order()`.

---

## 4. Fases

- **Fase 0 — Acesso (BLOQUEIO, Marcus):**
  conta **CNPJ** no developer.ifood.com.br · criar app (modelo **centralizado**)
  · obter `clientId`/`clientSecret` · confirmar o `merchant_id` de **1 loja
  piloto** (sugestão: JK ou Jardins, que já temos relatório pra comparar).

- **Fase 1 — Auth + Pedidos (piloto 1 loja):**
  módulo de auth + refresh de token · cron de polling de pedidos · gravar em
  `ifood_pedidos` · **validar contra 1 mês de relatório** (os números têm que
  bater).

- **Fase 2 — Financeiro:**
  Settlements/Events · conciliar repasse · validar que o **líquido bate** com o
  relatório de Conciliação.

- **Fase 3 — Avaliações:**
  Reviews · popular `ifood_avaliacoes`.

- **Fase 4 — Homologação + rollout:**
  homologar os módulos (Order, Financial) com o time iFood · ligar **todas** as
  lojas · manter import manual como fallback.

---

## 5. Riscos / pontos de atenção

- **Homologação** — exige app **pronto** + **CNPJ**; testam o app inteiro, não
  só as chamadas. Ordem obrigatória: construir → homologar → produção.
- **Rate limits** no polling — respeitar os intervalos definidos pelo iFood.
- **Segurança** — tokens criptografados, server-only; webhook (se usado) com
  verificação de assinatura.

## 6. O que NÃO muda

O import manual de relatório **continua existindo**: fallback, histórico
retroativo, e única fonte de avaliações/repasse do **99 Food e Keeta** até eles
exporem (ou nunca) esses dados.

---

## 7. Fontes

- Auth: https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/intro/
- Distribuído: https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/distributed/
- Order: https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/workflow/
- Financial: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/intro/
- Homologação Financial: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/homologation/
- Homologação Order: https://developer.ifood.com.br/pt-BR/docs/guides/order/homologation/
- Reviews: https://medium.com/ifood-developer/como-utilizar-a-api-de-reviews-do-ifood-do-zero-bbb408f5f824

---

## 8. Pesquisa 2026-06 — automação SEM RPA (e-mail vs API)

Pesquisa profunda (fontes oficiais verificadas) pra responder: dá pra automatizar
a ingestão diária **sem robô de login** (sem risco de ban)? Conclusões:

### ❌ Não existe relatório agendado por e-mail em nenhuma das 3
iFood, 99 e Keeta **só** mandam relatório por e-mail de forma **manual/sob
demanda** (logar → exportar → chega no e-mail). **Não há agendamento recorrente
nativo.** Logo, o "atalho do e-mail" não automatiza de verdade — só o robô (RPA)
faria, e isso arrisca as contas. **Descartado.**

### ✅ O caminho oficial é a API — e o iFood é o melhor encaixe
- **iFood — Conciliação On Demand** (`/financial/.../reconciliation-ondemand`):
  gera o arquivo **diariamente (D-1)**, em **CSV `.gz` com separador `;`** via
  link expirável (throttle de 6h pra regerar o mesmo período). É **quase
  plug-no-parser atual** (só `gunzip`). A API **Financial Events** traz o campo
  `impacto_no_repasse` (separa o que entra no repasse líquido) — casa com o DRE.
- **Barreira (confirmada):** exige **homologação como integrador** — conta
  **CNPJ** (recusa CPF), cadastro orientado a "integradora" com **CNAE de
  tecnologia**, e o iFood testa o app inteiro. Não é self-service de 1 loja.
  → Cozina Foods (CNPJ) pode homologar a própria integração; **verificar se
  precisa adicionar um CNAE de tecnologia** à empresa.

### 🔄 Correção sobre 99Food (vs. tabela da Seção 1)
A 99Food **foi relançada no Brasil em meados de 2025** e **agora TEM OpenAPI
oficial com módulo Financeiro dedicado** (escopo "permissões de integração
financeira"), além de Pedido/Menu/Loja/Auth. Ou seja, o financeiro do 99 **é
obtível via API** (não só export manual) — o que a Seção 1 marcava como "❌ fora
do padrão" está **desatualizado**. Onboarding de integrador parecido com o iFood.

### Keeta — só operacional, financeiro não confirmado
OpenDelivery é integração **técnica credenciada** (OAuth `client_credentials` +
assinatura **HMAC-SHA256**, NDA + onboarding como software provider). Cobre
**pedidos/cardápio (operação)**; **uso pra financeiro/histórico não foi
confirmado** pelas fontes. → manter **manual** por ora.

### Não há padrão único cobrindo financeiro nas 3
As 3 tocam o **Open Delivery**, mas o escopo é **operacional** (pedidos/menu). O
**financeiro/repasse depende da API proprietária de cada uma**.

### Plano priorizado (recomendação)
1. **iFood** (maior volume + dado mais importante + Conciliação On Demand quase
   pronta pro parser) → começar pela **homologação de integrador**. É o prêmio.
2. **99Food** → explorar a OpenAPI Financeira (onboarding parecido) — em paralelo.
3. **Keeta** → **manual** até a API cobrir financeiro.
4. **Import manual** continua como rede de segurança o tempo todo.

> Decisão de Marcus (2026-06): por ora **seguir com o import manual**; a
> automação via API fica pronta neste plano pra quando valer investir na
> homologação.

### Fontes (pesquisa 2026-06)
- iFood Conciliação On Demand: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-reconciliation-ondemand/
- iFood Financial Events: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-financial-events/
- iFood relatório de conciliação (blog parceiros): https://blog-parceiros.ifood.com.br/relatorio-de-conciliacao/
- 99Food OpenAPI: https://developer-food.99app.com  ·  portal lojista: https://merchant.99app.com
- Keeta OpenDelivery: https://api-docs.mykeeta.com/apis/opendelivery
