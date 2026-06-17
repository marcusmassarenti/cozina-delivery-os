# Homologação iFood Merchant-API — Módulo Financial

**Sessão:** terça, 23/06/2026 · 11:00–11:45 · [Google Meet](https://meet.google.com/tww-ndou-zfc)
**Ticket:** 28413618 · **Analista:** Rodrigo (rodrigo.baradel@ifood.com.br) · **Organizador:** fabricio.silveira@ifood.com.br
**Status pré-validação:** 18/20 critérios aprovados (2 pendentes — confirmar quais no início da call)

> ⏰ Tolerância de 10 min. Entrar 11:50 = reagendar via novo ticket. **Entrar 10:55.**
> ⚠️ "Problemas técnicos durante a homologação podem impactar o resultado" → tudo testado ANTES.

---

## 1. Quem somos (resposta de 30 segundos)

> "Somos a **Cozina Foods**, franqueadora da rede **Churrasco no Pote** (~20 lojas no iFood).
> Construímos um sistema próprio de gestão (Cozina Delivery OS) que consolida a operação
> das franquias. A integração com o módulo Financial é para **uso próprio da rede**:
> conciliação automática dos repasses, DRE por loja e fluxo de caixa — hoje fazemos isso
> importando relatórios manualmente, e a API elimina esse trabalho manual diário."

**Pontos-chave:** lojista/franqueador (não software house) · uso interno (não revenda) · sistema já existe e funciona com importação manual · a API substitui o manual.

## 2. Estado da nossa integração

| Fase | O quê | Status |
|---|---|---|
| 1 | Autenticação `client_credentials` + cache de token (renova 5 min antes de expirar) | ✅ `src/lib/ifood/auth.ts` |
| 2 | HTTP client central + 401 reauth + backoff 429/5xx + auditoria em `ifood_api_logs` | ✅ `src/lib/ifood/client.ts` |
| 3 | 6 endpoints da Merchant API implementados, testados em sandbox, retornando 200 com payload real | ✅ ver tabela abaixo |
| 4 | Painel interno `/integracao/ifood-homolog` com botão "Validar Tudo" + export JSON | ✅ pronto pra reunião |
| 5 | Cron diário `/api/cron/ifood-sync` (06h BRT) com throttle 6h por (merchant, endpoint) | ✅ `vercel.json` |
| 6 | UI `/integracao/ifood-merchants` pra vincular cada merchant a uma unidade da rede | ✅ pronta |

### Endpoints validados (sandbox, merchant de teste `500f2b4d-…`)

| # | Endpoint | Última validação | Detalhe |
|---|---|---|---|
| 1 | `GET /order/v1.0/orders/{id}` | 200 / 404 | Auth + roteamento OK |
| 2 | `GET /merchant/v1.0/merchants` | 200 | 1 merchant na conta |
| 3 | `GET /financial/v3.0/merchants/{id}/reconciliation?competence=YYYY-MM` | 200 | downloadPath emitido → baixa .gz → gunzip → CSV 271 linhas → R$ 977,63 líquido |
| 4 | `GET /financial/v3.0/merchants/{id}/financial-events?beginDate=…&endDate=…&page=N&size=100` | 200 | Paginação OK · 28 eventos |
| 5 | `GET /financial/v3.0/merchants/{id}/settlements?beginDate=…&endDate=…` | 200 | balance R$ 122,01 · 3 títulos (REPASSE) + dados bancários |
| 6 | `GET /financial/v3.0/merchants/{id}/anticipations?beginCalculationDate=…&endCalculationDate=…` | 200 | balance 0 (sem plano contratado nesse sandbox) |

### Resiliência implementada (em `src/lib/ifood/client.ts`)
- ✅ **Token cacheado** com expiração + renovação 5 min antes (`auth.ts`)
- ✅ **401 → clearIfoodTokenCache + retry 1×** automático
- ✅ **429 / 5xx → backoff exponencial** (`[2s, 4s, 8s]`, máx 3 tentativas)
- ✅ **Auditoria automática** em `ifood_api_logs`: endpoint, status, ms, retries, Authorization mascarado (`Bearer ***`), homologation_header
- ✅ **Throttle 6h por (merchant, endpoint)** em `ifood_api_throttle` — evita duplo disparo do cron
- ✅ **Header `x-request-homologation: true`** quando `IFOOD_HOMOLOGATION=true` (env separa sandbox de produção)

### Descobertas durante a implementação (úteis pra confirmar com o iFood)
1. **Doc da Reconciliation usa `competencia` (pt-BR), mas a API espera `competence` (en)** — retorna 400 `BAD_REQUEST "Required query parameter 'competence' is not present."` se mandar errado.
2. **Doc descreve paths como `/v3/reconciliation`, `/v3/financial-events`** — paths reais são `/financial/v3.0/merchants/{merchantId}/...`. Sem o prefixo `/financial/v3.0/merchants/{id}/`, o gateway retorna `{"message": "no Route matched with those values"}`.
3. **Reconciliation retorna `downloadPath`** (não `downloadUrl` como em algumas refs). Já tratado com fallback.

## 3. Roteiro da demo (10–12 min)

> **Tudo passa por `/integracao/ifood-homolog`** — painel interno construído pra essa reunião.

1. **Abrir o painel** → mostrar os 3 cards verdes no topo (Credenciais OK · Header `x-request-homologation` habilitado · Auditoria ativa).
2. **Botão "Validar Tudo"** (no topo) — clicar 1 vez, o painel dispara os 6 endpoints em sequência (~2.5s) e renderiza a tabela com ✓ pra cada um. Auditor vê tudo passando em tempo real.
3. **Auditoria · últimas 50 chamadas** (rolar pra baixo) — tabela mostra cada chamada já feita: endpoint, status, ms, retries, ✓ HOMOLOG.
4. **Drill-down em uma chamada** — clicar num tester específico (ex.: Reconciliation) → mostra resposta crua + amostra do CSV parseado (32 colunas, 271 linhas, R$ 977,63 líquido).
5. **Resiliência** — abrir `src/lib/ifood/client.ts` rapidamente se pedirem: 401 reauth, backoff [2s, 4s, 8s], logging em jsonb.
6. **Cron diário** — abrir `vercel.json` mostrando o schedule `0 9 * * *` (06h BRT D-1) e `/integracao/ifood-merchants` que vincula cada merchant a uma unidade da rede.
7. **Caso de uso final** — DRE por loja e fluxo de caixa (Dashboard) hoje alimentados por importação manual; com a API homologada, vira automático.

**Evidências pra anexar no ticket:** botão **"Baixar evidências (JSON)"** na seção Auditoria gera `ifood-audit-YYYY-MM-DD.json` com as 50 últimas chamadas (Authorization mascarado).

**Plano B se algo travar:** o JSON exportado tem todas as execuções anteriores; mostra do histórico.

## 4. Perguntas prováveis × nossas respostas

### Técnicas
| Pergunta | Resposta |
|---|---|
| Como autenticam? | `client_credentials` centralizado; token cacheado, renovado 5 min antes do vencimento; jamais token por request. |
| Com que frequência consultam? | 1x/dia por loja (dado financeiro é D+1); sem polling agressivo. |
| Como tratam rate limit? | Respeitamos os headers; em 429 aplicamos backoff exponencial e continuamos depois. |
| E se vier registro repetido? | Upsert idempotente por chave única (merchant + competência + id do registro) — reprocessar não duplica. |
| Token expirou no meio? | 401 → limpa cache, renova, repete a chamada 1x. |
| Quais endpoints usam? | Módulo Financial: conciliação/settlements por merchant + período. (Listar os exatos pós-Fase 2.) |
| Multi-merchant como? | Credencial única da rede; iteramos os merchantIds das lojas com intervalo entre chamadas. |

### Negócio
| Pergunta | Resposta |
|---|---|
| Integradora ou lojista? | Lojista (franqueadora) — uso interno, sem revenda. |
| Volume? | ~20 lojas, milhares de pedidos/mês na rede. |
| Pra que usam o dado? | Conciliação de repasse, DRE por loja, fluxo de caixa. |
| Vão usar outros módulos? | Hoje Financial; futuramente avaliamos Order/Review (não prometer prazo). |

## 5. Perguntas que NÓS faremos
1. Quais foram os **2 critérios reprovados** na pré-validação e o que esperam exatamente?
2. **Rate limits** oficiais do Financial em produção (por endpoint)?
3. **SLA do dado**: a conciliação fecha D+1? Que horas fica disponível?
4. Diferenças **sandbox × produção** no Financial?
5. Aprovado → **prazo de liberação** e processo pra produção?
6. Canal de suporte pós-produção (mudanças de contrato da API)?

## 6. Checklist do dia (22/06 à noite + 23/06 de manhã)
- [ ] **Clicar "Validar Tudo"** em `/integracao/ifood-homolog` e confirmar 6/6 ✓
- [ ] Baixar o JSON da auditoria pra ter em mãos durante a call
- [ ] Sistema aberto e logado · Portal do Parceiro aberto (mesma loja/competência da demo)
- [ ] Código aberto no editor: `src/lib/ifood/client.ts` + `auth.ts` (se pedirem detalhe)
- [ ] Internet estável / celular 4G de backup
- [ ] Entrar no Meet 10:55

## 7. Onde está cada coisa no código

| O quê | Onde |
|---|---|
| Painel de homologação (UI principal) | `src/app/(app)/integracao/ifood-homolog/page.tsx` |
| Botão "Validar Tudo" | `src/app/(app)/integracao/ifood-homolog/_components/validate-all.tsx` |
| UI de vincular merchants ↔ unidades | `src/app/(app)/integracao/ifood-merchants/page.tsx` |
| Auth + cache de token | `src/lib/ifood/auth.ts` |
| HTTP client central (401 reauth, backoff, logging) | `src/lib/ifood/client.ts` |
| 6 endpoints | `src/lib/ifood/{sales,reconciliation,events,merchants,settlements,anticipations}.ts` |
| Throttle 6h | `src/lib/ifood/throttle.ts` + tabela `ifood_api_throttle` |
| Cron diário (06h BRT) | `src/app/api/cron/ifood-sync/route.ts` + `vercel.json` |
| Orquestrador do cron | `src/lib/ifood/sync.ts` |
| Export JSON da auditoria | `src/app/api/integracao/ifood-audit-export/route.ts` |
| Tabelas no Supabase | `ifood_api_logs` · `ifood_api_throttle` · `ifood_merchants` |
