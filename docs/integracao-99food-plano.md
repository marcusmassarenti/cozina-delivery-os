# Integração automática 99 Food — Plano

> Objetivo: substituir o **upload manual** dos relatórios do 99 Food por
> **ingestão automática via API oficial**, alimentando as tabelas que já
> existem (`ninefood_daily_loja`, `ninefood_daily_item`, `ninefood_pedidos`).
> O import manual continua existindo como fallback.

Decisão (2026-06): tocar o 99 **em paralelo** com a homologação do iFood —
Marcus pediu. O processo é parecido (cadastro de integrador → app →
credenciais → homologação), então a 2ª homologação tende a ser mais rápida.

> **Status (2026-06-06):** cadastro de integrador **enviado** no portal
> `developer-food.99app.com` com a empresa **Lab of Change Ltda** (CNPJ
> 38.613.971/0001-80, mesma do iFood). O 99 informou que **verifica em até 3
> dias úteis** e responde **por e-mail**. → aguardando aprovação pra criar o
> app e obter `clientId`/`clientSecret`.

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

- **Fase 1 — Auth:** módulo `src/lib/ifood/auth.ts` clonado pro 99 + teste de
  token no ambiente de teste.

- **Fase 2 — Financeiro:** client do módulo financeiro → conciliar repasse →
  validar que o **líquido bate** com o relatório manual de 1 mês.

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
