# Homologação iFood Merchant-API — Módulo Review (Avaliações)

**App:** Cozina Delivery OS — Avaliações · Client ID `d730a9cc-7b3f-4253-a8cc-24756a651c61`
**Categoria:** Avaliações · **Módulo:** Review · **Visibilidade:** Não listado
**Integrador:** Lab of Change Ltda (mesma conta do Financial, já homologado)
**Loja de teste (sandbox):** `500f2b4d-1807-4a9c-9e7d-93e87c128891` (app de teste)
**Painel de homologação:** `/integracao/ifood-review-homolog` (superadmin)

> ⏰ A call dura ~45 min, com um analista acompanhando por acesso remoto. Entrar
> com 5 min de folga. **Testar tudo ANTES** — "problemas técnicos durante a
> homologação podem impactar o resultado".

---

## 1. Quem somos (resposta de 30 segundos)

> "Somos a **Cozina Foods**, franqueadora da rede **Churrasco no Pote** (~20 lojas
> no iFood). Construímos um sistema próprio de gestão (**Cozina Delivery OS**) que
> consolida a operação das franquias. A integração com o módulo **Review** é para
> **uso próprio da rede**: ver e **responder as avaliações** das lojas direto do
> nosso painel, acompanhar a reputação e a satisfação do cliente de forma
> centralizada. Já somos homologados no módulo Financial."

**Pontos-chave:** lojista/franqueadora (não software house) · uso interno (não
revenda) · sistema já existe e funciona · já homologados no Financial.

---

## 2. Estado da nossa integração

| Fase | O quê | Status |
|---|---|---|
| 1 | Auth `client_credentials` + cache de token, **multi-app** (Financial / Review / Teste) | ✅ `src/lib/ifood/auth.ts` |
| 2 | HTTP client central: 401 reauth, backoff 429/5xx, auditoria em `ifood_api_logs` | ✅ `src/lib/ifood/client.ts` (já homologado no Financial) |
| 3 | Endpoints do Review **v2.0** implementados e testados | ✅ `src/lib/ifood/review.ts` |
| 4 | Painel `/integracao/ifood-review-homolog` com testers + checklist | ✅ pronto pra call |

### Endpoints implementados (Review **v2.0** — V1 está descontinuado/410)

| # | Endpoint | O que valida |
|---|---|---|
| 1 | `GET /review/v2.0/merchants/{id}/reviews?page&size&addCount&dateFrom&dateTo&sort` | Listagem + paginação + contagem |
| 2 | `GET /review/v2.0/merchants/{id}/reviews/{reviewId}` | Detalhe de uma avaliação |
| 3 | `GET /review/v2.0/merchants/{id}/summary` | Desempenho/nota da loja |
| 4 | `POST /review/v2.0/merchants/{id}/reviews/{reviewId}/answers` `{text}` | Responder (só `NOT_REPLIED`) |

### Resiliência (herdada do client central já homologado)
- ✅ Token cacheado **por app**, renovado 5 min antes de expirar
- ✅ 401 → limpa cache + retry 1×
- ✅ 429 / 5xx → backoff exponencial [2s, 4s, 8s]
- ✅ Auditoria automática em `ifood_api_logs` (endpoint, status, ms, retries, Authorization mascarado)

---

## 3. Critérios de homologação do Review (o que eles vão testar)

- [ ] `GET /reviews` com **paginação** + `addCount=true` retornando `total` e `pageCount`
- [ ] Campos validados na resposta: **`status`**, **`replies[]`**, **`version`**, **`visibility`**
- [ ] Status do ciclo: **CREATED · NOT_REPLIED · REPLIED · PUBLISHED**
- [ ] `visibility` retornando **PUBLIC / PRIVATE**
- [ ] **Filtro de data** (`dateFrom` / `dateTo`)
- [ ] **Responder somente** avaliações em `NOT_REPLIED` (POST answers)
- [ ] Cenário **sem avaliações** (`reviews: []`, `total: 0`) ✅ já confirmado
- [ ] **Requisições reais feitas ≥ 2 dias antes** da data agendada

### Ciclo de vida da avaliação (entender pra explicar)
```
CREATED → NOT_REPLIED → REPLIED → PUBLISHED
```
- Há uma **janela interna de ~24h** antes da avaliação ficar disponível pra resposta.
- **Só responde** quem está em `NOT_REPLIED`.
- Avaliação **não respondida vira PUBLISHED automaticamente em ~5 dias** (e o cliente nunca vê a resposta se passar o prazo).

---

## 4. Roteiro da demo (10–12 min)

> Tudo passa por **`/integracao/ifood-review-homolog`**.

1. **Abrir o painel** → mostrar os 3 status verdes no topo (Modo homologação · Credenciais de teste · App de produção).
2. **"Listar + contagem"** → mostra a resposta com `total` / `pageCount` (prova `addCount`) e os campos `status`, `replies[]`, `version`, `visibility`.
3. **Status do ciclo** → apontar os status presentes (CREATED / NOT_REPLIED / REPLIED / PUBLISHED) e o `visibility` (PUBLIC/PRIVATE).
4. **"Detalhe"** → colar um `reviewId` da listagem e mostrar o detalhe.
5. **Filtro de data** → demonstrar `dateFrom`/`dateTo`.
6. **"Responder"** → numa avaliação `NOT_REPLIED`, enviar a resposta (POST answers) e mostrar que **só** funciona nesse status.
7. **Cenário sem avaliações** → mostrar `reviews: []`, `total: 0` (já validado).
8. **Resiliência / auditoria** → abrir `src/lib/ifood/client.ts` se pedirem (401 reauth, backoff, log em `ifood_api_logs`).

> ⚠️ **A avaliação de teste:** se a loja sandbox ainda estiver sem reviews, pedir
> ao analista pra ajudar a gerar uma (concluir + avaliar o pedido de teste). Aí
> demonstramos listar → detalhe → responder ao vivo.

---

## 5. Perguntas prováveis × nossas respostas

### Técnicas
| Pergunta | Resposta |
|---|---|
| Como autenticam? | `client_credentials` centralizado; token cacheado por app, renovado antes de vencer. |
| Qual versão da API? | **v2.0** (sabemos que a v1 está descontinuada — retorna 410). |
| Com que frequência consultam? | Algumas vezes ao dia por loja; sem polling agressivo. Respeitamos os rate limits. |
| Como tratam rate limit? | Backoff exponencial em 429 e continua depois. |
| Quando respondem uma avaliação? | Só as que estão em `NOT_REPLIED`, dentro da janela (antes de virar PUBLISHED). |
| Como tratam paginação? | `page`/`size` + `addCount=true` pra `total`/`pageCount`; iteramos até esvaziar. |
| Onde guardam o token? | Em memória do servidor, por app; nunca no banco nem no client. |

### Negócio
| Pergunta | Resposta |
|---|---|
| Integradora ou lojista? | Lojista (franqueadora) — uso interno, sem revenda. |
| Pra que usam as avaliações? | Acompanhar reputação por loja e **responder os clientes** de forma centralizada. |
| Volume? | ~20 lojas da rede. |
| Já usam outros módulos? | Sim — **Financial homologado** e em produção. |

---

## 6. Perguntas que NÓS faremos
1. **Rate limits** oficiais do Review em produção (por endpoint)?
2. Aprovado → como **vincular as lojas reais** ao app de produção (`d730a9cc…`) e o processo de autorização por loja?
3. Como **gerar uma avaliação de teste** pra demonstração (concluir + avaliar pedido de teste no sandbox)?
4. **SLA do dado**: depois que o cliente avalia, quanto tempo até ficar disponível na API (a janela de 24h)?
5. Diferenças **sandbox × produção** no Review?

---

## 7. Checklist do dia
- [ ] Abrir `/integracao/ifood-review-homolog` e rodar **"Listar + contagem"** → confirmar 200
- [ ] Garantir que houve **chamadas reais ≥ 2 dias antes** (rodar o "Listar" alguns dias antes)
- [ ] Se possível, **ter ≥1 avaliação no sandbox** (senão, pedir ajuda ao analista na call)
- [ ] Sistema aberto e logado (superadmin) · código aberto: `src/lib/ifood/review.ts` + `client.ts`
- [ ] Internet estável / 4G de backup · entrar 5 min antes

---

## 8. Onde está cada coisa no código

| O quê | Onde |
|---|---|
| Painel de homologação | `src/app/(app)/integracao/ifood-review-homolog/page.tsx` |
| Testers (server actions) | `src/app/(app)/integracao/ifood-review-homolog/_actions.ts` |
| Componente de teste | `src/app/(app)/integracao/ifood-review-homolog/_components/review-tester.tsx` |
| Lib do Review v2.0 | `src/lib/ifood/review.ts` |
| Auth multi-app (Financial/Review/Teste) | `src/lib/ifood/auth.ts` |
| HTTP client central (reauth, backoff, log) | `src/lib/ifood/client.ts` |

---

## 9. Depois de aprovado
1. Vincular as lojas reais ao app `d730a9cc…` (Permissões → por ID/CNPJ → loja aceita no Portal do Parceiro).
2. Setar `IFOOD_REVIEW_HOMOLOGATION=false` na Vercel (passa a usar o app de produção do Review).
3. Persistir as avaliações da API e trocar a importação manual de avaliações pelo sync.
4. (Bônus) responder avaliações direto do Delivery OS.
