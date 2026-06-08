# Integração automática 99 Food — Plano

> Objetivo: substituir o **upload manual** dos relatórios do 99 Food por
> **ingestão automática via API oficial**, alimentando as tabelas que já
> existem (`ninefood_daily_loja`, `ninefood_daily_item`, `ninefood_pedidos`).
> O import manual continua existindo como fallback.

Decisão (2026-06): tocar o 99 **em paralelo** com a homologação do iFood —
Marcus pediu. O processo é parecido (cadastro de integrador → app →
credenciais → homologação), então a 2ª homologação tende a ser mais rápida.

> **Status (2026-06-08):** ✅ **TUDO construído e provado no ambiente de TESTE.**
> APP ID `5764607750120671193`; auth operacional + auth financeiro + Bill Data
> + Settlements todos testados ao vivo (errno=0); `ninefood_bill` (0046) rodada
> + smoke-test idempotente; motor (`sync.ts`) + agregador (`ninefood-api.ts`)
> com tsc limpo.
>
> 🚧 **ÚNICO BLOQUEIO p/ dado real:** o app é de **TESTE** ("test environment").
> Ao tentar autorizar a loja real **"Churrasco no Pote - Jardins"** pelo link
> `authorizationpage/getUrl` (que FUNCIONA e lista a loja), o 99 barrou com
> **"Authorization failed, limited to authorized live environment application"**.
> → Precisa **promover o app de teste → produção/live** no portal do 99
> (mesmo tipo de portão da homologação do iFood). Depois disso: abrir o link,
> autorizar a loja, e `getShopBillDetail` devolve R$ real.

---

## 1. O que já está confirmado (pesquisa 2026-06)

- **Portal de desenvolvedor existe:** `developer-food.99app.com` (SPA em
  JavaScript — não é raspável por fora; precisa logar e navegar no browser).
- **A API é real e está em produção:** vários ERPs/PDVs já integram com ela
  (RCKY, BeeFood, Cardápio Web, Foody Delivery, Linx). Ou seja, não é vaporware.
- **Cobre o financeiro:** a documentação dos integradores cita que a API envia
  **valores, taxas e repasses** (além de pedido/status/itens) — então o
  **financeiro/repasse do 99 é obtível por API**, não só por planilha.
- **Relançamento:** o 99 Food foi relançado no Brasil em meados de 2025; a
  OpenAPI atual tem módulos de **Autenticação, Pedido, Cardápio/Menu, Loja e
  Financeiro** (escopo de "permissões de integração financeira").

### ✅ Confirmado DENTRO do portal (2026-06-06) — tem Financial API!

Navegando os "Documentos do desenvolvedor" (aba **Food** → API Reference),
confirmamos a lista de módulos da OpenAPI do 99:

- **Authorization** — `Get/Refresh Authtoken` (autentica com **app_id +
  app_secret**, obtidos no "Gerenciamento de aplicativo"). Modelo de **bind de
  loja**: vincula cada loja ao app e usa um `auth_token` por loja.
- **Store / Menu / Order / Logistics** — todo o operacional + **webhooks**.
- **Financial API** ⭐ (é o que queremos):
  - `Get Financial API Authtoken` — token próprio do financeiro (escopo
    separado, mais privilegiado).
  - `Get Bill Data` — fatura/taxas.
  - `Get Settlements Data` — **repasse** (líquido transferido pra loja).
- Também há **Open Delivery Protocol** como alternativa de protocolo.
- **Ambiente sandbox** disponível no portal → dá pra testar **sem** esperar a
  aprovação de produção.

→ Conclusão: o 99 **expõe financeiro/conciliação por API** (Settlements +
Bill), diferente da Keeta. Vale integrar. O `Get Settlements Data` é o
análogo do Settlements do iFood — casa direto com o nosso DRE/repasse.

## 1.1. Contrato decodificado do YAML (swagger oficial, 2026-06-08)

Marcus baixou o `swagger.yaml` em "Documentos do desenvolvedor". Decodificado:

- **Base URL:** `https://openapi.didi-food.com`
- **Auth (sem assinatura):** `GET /v1/auth/authtoken/get?app_id&app_secret&app_shop_id`
  → devolve `auth_token` + `token_expiration_time` (epoch s). `…/refresh` gera
  um token novo. O `auth_token` é **por loja** (`app_shop_id` = id que NÓS
  damos à loja). → **é assim que o `src/lib/ninefood/auth.ts` foi construído.**
- **Resposta padrão:** `StandardResponse` = `{ errno, errmsg, data }`.
- **Bind de loja:** `POST /v1/auth/authorizationpage/getUrl` (app_id + app_shop_id)
  devolve uma URL self-service pra loja autorizar; ou vincula-se loja de teste
  pelo portal.
- **Assinatura HMAC (`sign`):** só aparece em `POST /v1/shop/shop/list` (listar
  lojas vinculadas), com `app_id + timestamp + sign`. O **algoritmo do `sign`**
  NÃO está no YAML (fica na página de prosa "Authentication & Signature
  Mechanism"). Só precisamos dele pra `shop/list`; o resto usa `auth_token`.
- **Operacional disponível:** Pedido (`/v1/order/*` — detail/confirm/cancel/
  ready/delivered/apply), Cardápio (`/v1/item/*`, `/v3/item/*`), Loja
  (`/v1/shop/*`), Imagem (`/v3/image/*`). O `order/detail` traz `PriceModel`
  rico (real_price, delivery_price, refund_price, descontos…), mas **só por
  `order_id`** — não há "listar pedidos por período".

### Financial API — auth próprio (decodificado + testado 2026-06-08)

A Financial API é um sub-sistema **separado** do operacional:

- **Host:** `https://openapi.99food.com` (≠ `openapi.didi-food.com` do operacional).
- **Auth (app-level, NÃO por loja):** `POST /v3/auth/authtoken/signIn`
  - body JSON: `{ "retailer": <app_id>, "secret": <app_secret> }`
  - resposta **no topo** (sem `errno`/`data` wrapper): `{ accessToken, expiresIn }`
  - `accessToken` é um **JWT** (~147 chars); `expiresIn` = **21600 s (6 h)**.
  - ✅ **testado ao vivo** com as credenciais reais → HTTP 200, token emitido.
  - Implementado em `src/lib/ninefood/financeiro.ts` (`getNinefoodFinancialToken()`),
    cacheado em memória, renovado por demanda. Test script:
    `scripts/test-ninefood-financial.mjs`.
#### Bill Data (`getShopBillDetail`) — extrato pedido-a-pedido ✅ testado

- **`POST https://openapi.99food.com/v3/finance/finance/getShopBillDetail`**
- Header `Authorization: Bearer <accessToken financeiro>`.
- Body: `acceptor_code` (= `app_shop_id`), `start_date`/`end_date` (YYYYMMDD,
  **máx 31 dias**, até **3 meses** atrás), `page_no`, `page_size` (máx 200).
- Resposta: `{ errno, errmsg, data: { data: [...linhas], total_num, total_page,
  page_size, page_no } }` — **nested `data.data`**.
- Cada linha = 1 transação. **Valores em CENTAVOS** (÷100 = R$).
  `commissionRate` em 1/100 de % (3500 = 35%). Campos-chave:
  `settlementAmount` ⭐ (líquido a repassar), `commissionAmount`/`commissionRate`
  (taxa), `b2pDeliveryAmount` (logística), `payCommissionAmount` (taxa de pgto),
  `mealVoucherAmount` (**VR**), `orderType` (1 receita/2 reembolso/3 parcial/4
  pós-venda/5 sem-acompanhamento), `paymentChannel` (PIX 212/280, cartão,
  VR 259, Alelo 260…), `expectSettleDate`, `dayPaymentId`.
- ⚠️ doc diz "Special Authorization Needed (por e-mail)", **mas o teste ao vivo
  com o app aprovado deu `errno=0`** → acesso já liberado (no sandbox/test).
- ✅ Implementado: `getShopBillDetail()` + `getAllShopBillDetail()` em
  `src/lib/ninefood/financeiro.ts`. Test: `scripts/test-ninefood-bill.mjs`.
  Erros úteis: 110004 (só 3 meses), 110005 (máx 31 dias), 10002 (param).
#### Settlements (`getShopBillWeek`) — repasse bancário semanal ✅ testado

- **`POST .../v3/finance/finance/getShopBillWeek`** · header Bearer · permissão
  **WhiteList** (testado: `errno=0`, acesso ok no sandbox).
- Body igual ao Bill Data (`acceptor_code`, datas YYYYMMDD, paginação).
- 1 linha = 1 saque: `withdrawAmount` (CENTAVOS, depósito), `withdrawDate`
  (quando caiu), `settleStartDate`/`settleEndDate` (semana), `weekPaymentId`,
  `liability`, `currency` (BRL), `dayPaymentIDList` (liga aos `dayPaymentId`
  do Bill Data).
- Uso: **conciliação de caixa** (bater com extrato bancário). O DRE em si sai
  do Bill Data (per-order). Implementado: `getShopBillWeek()` em `financeiro.ts`.

### ⚠️ O YAML operacional NÃO traz a Financial API

Os 35 endpoints do YAML são Auth/Order/Item/Shop/Image. **Não há nenhum
endpoint financeiro** (`grep -i financ|settle|bill` = 0). Ou seja: o
`Get Settlements Data` / `Get Bill Data` / `Get Financial API Authtoken` que
vimos na navegação do docs **estão num spec/aba separada**, não neste download.

→ **Pra automatizar o financeiro (o objetivo do DRE) preciso dessa spec
separada** — outro YAML, OU prints das 3 páginas do docs (Financial API).

## 2. O que ainda NÃO dá pra confirmar por fora

- O **passo a passo exato do cadastro de integrador** (telas, campos, se exige
  CNAE de tecnologia, prazo de aprovação) — está atrás do portal logado.
- Os **endpoints e o contrato exato** do módulo Financeiro (formato do repasse,
  se é evento, settlement, CSV, etc.).
- Se há **homologação obrigatória** como no iFood (provável que sim, pelo
  padrão do mercado).

→ Esses pontos a gente levanta **acessando o portal** (igual fizemos com o
iFood: Marcus navega e manda print, eu guio passo a passo).

## 3. Abordagem (espelha o iFood)

- **Auth:** modelo CENTRALIZADO se o 99 permitir (uma conta da holding cobrindo
  todas as lojas) — `client_credentials`, credenciais em **env var server-only**
  (`NINEFOOD_CLIENT_ID` / `NINEFOOD_CLIENT_SECRET`), nunca no banco nem no client.
  Token cacheado em memória, renovado por demanda. Mesmo desenho do
  `src/lib/ifood/auth.ts`.
- **Financeiro:** job diário (cron Vercel, D-1) consumindo o módulo financeiro →
  upsert idempotente nas tabelas `ninefood_*` que já existem.
- **Mapa de lojas:** `unit_id ↔ merchant_id do 99` (igual ao mapa do iFood).
- **Ambiente de teste:** usar o sandbox/homologação do 99 se existir.

## 4. Vantagem: o lado do build já está meio pronto

Diferente do iFood, **o 99 já tem parser e tabelas** (do import manual):
`src/lib/import/ninefood/` + `ninefood_daily_loja/item/pedidos` +
`src/lib/data/ninefood-imported.ts`. Quando o acesso à API sair, "plugar" é
basicamente: client de auth → client do financeiro → gravar nas mesmas tabelas.
Telas (Dashboard, DRE, Avaliações, Pedidos) já consomem esses dados.

## 5. Fases

- **Fase 0 — Acesso (BLOQUEIO, 99 Food):** ⏳ EM ANDAMENTO
  ✅ cadastro de integrador enviado (Lab of Change Ltda) em 2026-06-06 ·
  ⏳ **"Gerenciamento de qualificações" = "Em análise"** (até 3 dias úteis,
  resposta por e-mail). **Confirmado:** o portal **bloqueia criar app** (até o
  de teste) enquanto a qualificação não for aprovada — tentamos criar o app
  "Cozina Delivery OS - Teste" em 2026-06-06 e deu "Falha na solicitação" por
  isso. · ○ criar app de teste · ○ obter `app_id`/`app_secret` · ○ vincular
  lojas (bind) · ○ confirmar `shopId` de 1 loja piloto.

  Dados do cadastro (pra referência): perfil "Tecnologia / integradora",
  marca "Churrasco no Pote", 18 estabelecimentos, 10 funcionários, ID da
  empresa no 99 = `5764651942684002865`, webhook planejado
  `https://delivery.cozinafoods.com/api/webhooks/99food`.

- **Fase 1 — Auth:** ✅ **CONCLUÍDA (2026-06-08).** Módulo
  `src/lib/ninefood/auth.ts` + script `scripts/test-ninefood-auth.mjs`.
  Loja de teste criada no portal: nome `Cozina Teste`, `app_shop_id`
  `cozina-teste-01` (shop_id atribuído pelo 99 = `5764616027024920000`).
  **Teste ao vivo OK:** `authtoken/get` → HTTP 200 errno=0, `auth_token`
  emitido (44 chars, exp ~3h); `shop/detail` com o token → HTTP 200 errno=0,
  devolveu a loja certa. Pipeline credencial → token → dados **provado**.

- **Fase 2 — Financeiro:** ✅ **CLIENT CONSTRUÍDO E TESTADO (2026-06-08).**
  `src/lib/ninefood/financeiro.ts`: `getNinefoodFinancialToken()` (signIn) +
  `getShopBillDetail()`/`getAllShopBillDetail()`. Teste ao vivo: auth financeiro
  errno=0 (JWT 6h) e `getShopBillDetail` errno=0 (acesso liberado, extrato vazio
  só porque a loja de teste não tem pedidos). Contrato em §1.1.
  → **Resta validar com DADO REAL** (loja real vinculada) que o líquido bate
  com o relatório manual de 1 mês.

- **Fase 3 — Pedidos/Cardápio (opcional):** já temos parser; avaliar se troca
  pelo feed de API.

- **Fase 4 — Homologação + rollout:** homologar (se exigido) · ligar todas as
  lojas · manter import manual como fallback.

## 6. Próximo passo concreto

1. Marcus abre `developer-food.99app.com`, faz login/cadastro com o CNPJ.
2. Manda print de cada tela (tipo de conta, cadastro de app, escopos,
   credenciais) — eu guio a escolha em cada passo, como no iFood.
3. Com `clientId`/`clientSecret` em mãos → coloco em `.env.local`
   (`NINEFOOD_CLIENT_ID` / `NINEFOOD_CLIENT_SECRET`) e clono o módulo de auth.

## 7. Fontes (pesquisa 2026-06)

- Portal dev 99 Food: https://developer-food.99app.com/
- Integração 99 Food (ERP, cita financeiro/taxas/repasses): https://rcky.com.br/blog/99food-integracao/
- 99 Food para restaurante (BeeFood): https://beefood.com.br/sistema-integrado-99food/tudo-sobre-99-food/
- Central de ajuda integração (Cardápio Web): https://ajuda.cardapioweb.com/automacao/integracoes/99food
