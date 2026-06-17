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

## 2. Estado da nossa integração (interno — não falar números na call)

| Fase | O quê | Status |
|---|---|---|
| 1 | Autenticação `client_credentials` + cache de token (renova 5 min antes de expirar) | ✅ pronta (`src/lib/ifood/auth.ts`) |
| 2 | Client do módulo Financial (conciliação/settlements + 429/retry + dedupe) | 🔨 construir antes da call |
| 3 | Gravar no banco + exibir no sistema (conciliação na tela) | 🔨 construir antes da call |

### Revisão do que existe (auth.ts) vs critérios clássicos
- ✅ **Token cacheado** com expiração — NÃO pede token a cada request (critério que mais reprova)
- ✅ Renovação com margem de 5 min; `clearIfoodTokenCache()` pra recuperar de 401
- ✅ Form `application/x-www-form-urlencoded` com campos camelCase (formato exigido)
- ✅ Credenciais só em env server-only
- ⚠️ A construir na Fase 2: tratamento de **429 com backoff**, **retry pós-401** (1x com clearCache), **dedupe por id de evento/registro**, **paginação e janela de datas** correta

## 3. Roteiro da demo (10–12 min)

1. **Abrir o sistema** (produção) → Dashboard com as ~20 lojas → "este é o sistema que consome a API".
2. **Autenticação** — mostrar o código do `auth.ts` (token cacheado + renovação). Falar: "token é cacheado e renovado 5 minutos antes de expirar; nunca solicitamos token por request".
3. **Requisição Financial ao vivo** — disparar a sincronização (botão/rota) → log da chamada (endpoint, status 200) → dados de conciliação aparecendo no sistema.
4. **Conferência de valores** — abrir uma loja e mostrar repasse/taxas batendo com o Portal do Parceiro (ter o portal aberto na mesma competência).
5. **Resiliência** (falar, com código aberto se pedirem): 429 → backoff e reagenda; 401 → limpa cache de token e repete 1x; reprocessamento não duplica (dedupe por id).
6. **Caso de uso final** — DRE por loja e fluxo de caixa alimentados pelo dado conciliado.

**Plano B se algo travar:** coleção Postman pronta com as mesmas chamadas + prints/logs de execuções anteriores.

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
- [ ] Rodar a sincronização Financial de ponta a ponta na véspera (e de manhã)
- [ ] Sistema aberto e logado · Portal do Parceiro aberto (mesma loja/competência da demo)
- [ ] Postman com as chamadas prontas (plano B) · logs/prints de execuções salvas
- [ ] Código aberto no editor: `auth.ts` + client financial
- [ ] Internet estável / celular 4G de backup
- [ ] Entrar no Meet 10:55

---
*Atualizar este doc com os achados da pesquisa (processo, critérios, falhas comuns) antes da call.*
