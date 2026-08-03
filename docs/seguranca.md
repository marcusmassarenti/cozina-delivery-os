# Segurança — Cozina Delivery OS

Resumo da postura de segurança + runbook operacional. Base pra handoff.

Última auditoria: **03/ago/2026** (externa, read-only + varredura completa do schema
e teste ofensivo real contra produção com a chave publicável).
Anterior: 14/jul/2026 (recon estática, sem teste ofensivo).

> **Achou um P0 explorável.** Ver §1.1. A auditoria de julho concluiu "nenhum
> P0/P1" — e estava errada, porque olhou `search_path` das funções
> `SECURITY DEFINER` mas não **quem podia executá-las**.

---

## 1. Postura atual (auditado)

| Área | Estado |
|---|---|
| **RLS (multi-tenant)** | ✅ As **89** tabelas do `public` com RLS ligada. Nenhuma policy deixa o `anon` passar — testado de verdade em 10 tabelas sensíveis (`holdings`, `units`, `fin_entries`, `ifood_financeiro_lancamentos`…): todas **401** ou vazio. ⚠️ Ressalva: **83 das 89 têm grant efetivo pro `anon`** (herdado via `PUBLIC`); o que nega é a RLS, não a ausência de grant. Ou seja, adicionar uma policy permissiva numa das 37 tabelas hoje sem policy a abre **na hora**. |
| **Funções SECURITY DEFINER** | ✅ **27** no `public`, todas com `search_path` fixo **e nenhuma executável pelo `anon`** (varrido em 03/ago, incluindo `vault` e `pgbouncer`). `has_*_access` mantém `authenticated` de propósito — é assim que a RLS avalia as policies. |
| **Views** | ✅ Não existe nenhuma no `public`. Elimina a classe "view que ignora RLS" (`security_invoker` off é o padrão e passa por cima da RLS das tabelas de baixo). |
| **Escrita anônima** | ✅ Zero policies de INSERT/UPDATE/DELETE alcançam o `anon` sem checar identidade. |
| **Storage** | ⚠️ Os 3 buckets (`branding`, `fin-logos`, `tutoriais`) são **públicos**. Conferido: só logos e vídeos de tutorial, nada sensível. `fin-logos` está vazio. |
| **service_role / secrets** | ✅ Só server-side (`lib/supabase/admin.ts` com `import "server-only"`). Nenhum em componente `"use client"`. `.env` nunca commitado; `.gitignore` cobre `.env*`. |
| **`NEXT_PUBLIC_*`** | ✅ Só `SUPABASE_URL` e `ANON_KEY` (públicos por design). |
| **API do ERP (v1)** | ✅ `verifyApiKey` (chave em **hash SHA-256**) + escopo por unidades do `api_client`. |
| **Webhook Asaas (pagamento)** | ✅ Valida `asaas-access-token` com `timingSafeEqual` + **fail-closed** + idempotência (`asaas_processed_events`). |
| **Crons** | ✅ Exigem `Authorization: Bearer <CRON_SECRET>` (fail-closed). |
| **IA (diagnóstico)** | ✅ `system` em role separada, saída validada como JSON, sem secret no contexto. + regra anti-injection (trata dado/reviews como conteúdo, nunca instrução). |
| **Webhook 99food** | ✅ **Travado** (21/jul/2026): `NINEFOOD_WEBHOOK_SECRET` na Vercel + `?token=` na URL do portal da 99. Verificado em prod: POST sem token → **401**, GET → 200. Antes era progressivo (ver §3). |

## 1.1 P0 de 03/ago/2026 — RPCs abertas ao anônimo (CORRIGIDO)

Cinco funções `SECURITY DEFINER` estavam executáveis pelo `anon`. Como
`SECURITY DEFINER` roda como o dono e **ignora RLS**, isso furava o
multi-tenant inteiro. Explorado de verdade, com a chave publicável (a que já vai
no navegador de qualquer visitante), **sem login**:

```
POST /rest/v1/rpc/conferencia_fontes_ifood  {"p_year":2026,"p_month":7}
→ HTTP 200 — 55 lojas, de TODOS os clientes
```

`conferencia_fontes_ifood` não recebe parâmetro de cliente (só ano e mês) e
devolve `unit_id` — que é a entrada de `lojas_sem_dado` e
`fechamento_mes_faltando`. Dava pra encadear. `resumo_semanal` devolve
faturamento bruto e loja destaque por holding.

**Causa:** o Postgres concede `EXECUTE` a `PUBLIC` por padrão, e no Supabase o
`anon` herda. Sem `revoke` explícito, toda função nasce aberta.

**Corrigido** na migration `0151` (retestado: `anon` → 401, `service_role` → 200).

### Por que passou batido duas vezes

Não é a primeira vez: em **jul/2026** foram 6 RPCs de financeiro, trancadas pela
`0083`. Aquela correção trancou **as funções que existiam naquele dia** e não
deixou nada que impedisse as próximas de nascerem abertas — e as migrations
`0140`, `0142`, `0146` e `0149` vieram depois, todas sem `revoke`.
Tratamos o sintoma duas vezes.

**REGRA:** toda função `SECURITY DEFINER` nasce, na MESMA migration, com
```sql
revoke execute on function <assinatura> from public, anon, authenticated;
grant  execute on function <assinatura> to service_role;
```
Exceção: helpers de RLS (`has_unit_access` e afins) mantêm `authenticated` —
sem isso a RLS não avalia as policies.

**Guarda automática:** `scripts/ci/checa-rpc-anon.mjs` roda no CI e falha se
qualquer função `SECURITY DEFINER` ficar alcançável pelo `anon`. Depende dos
secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` no GitHub — **sem eles
a checagem avisa e passa**, então conferir que estão setados.

## 1.2 Dependências (03/ago/2026)

De **8 vulnerabilidades altas em produção para 1**.

O `next` **não tinha falha própria** — era sinalizado *através* de `postcss`
(path traversal via `sourceMappingURL`) e `sharp` (CVEs do libvips), que ele
fixa em versões vulneráveis. Subir 16.2.6 → 16.2.12 **não resolveu**; o `npm`
chegava a sugerir "correção: 9.3.3", ou seja, voltar sete versões maiores.
Resolvido com `overrides` no `package.json` (postcss ≥8.5.25, sharp ≥0.35.3).
O `next/image` não é usado em lugar nenhum do projeto — o `sharp` é peso morto.

`shadcn` (CLI de scaffold) estava em `dependencies` e arrastava `hono` e
`fast-uri` pra produção. Movido pra `devDependencies`.

**Sobra 1, sem correção disponível:** `xlsx`/SheetJS (prototype pollution +
ReDoS). É o mais exposto que temos — processa **planilha que o cliente sobe**.
Saídas: migrar pro CDN oficial do SheetJS (que tem versão corrigida fora do
npm) ou trocar de parser. Decisão em aberto desde jul/2026.

### Nota de defesa-em-profundidade (a fazer no futuro)
As policies de RLS são de **SELECT** — as **escritas** passam pelo `service_role` (server actions), que **ignora RLS**. A segurança das escritas depende do `getAccessibleUnitIds`/permissions na aplicação. Vale, no futuro, adicionar policies de write (`WITH CHECK`) como rede de segurança no banco.

---

## 2. Variáveis de ambiente (Vercel)

Secrets que o sistema usa (conferir em Vercel → projeto `cozina-delivery-os` → Settings → Environment Variables):

| Var | Papel | Fail-closed? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso admin ao banco (server) | — |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Públicos (client) | — |
| `ASAAS_WEBHOOK_TOKEN` | Trava o webhook de cobrança | **Sim** (sem ele, webhook recusa) |
| `CRON_SECRET` | Trava os crons | **Sim** |
| `NINEFOOD_WEBHOOK_SECRET` | Trava o webhook da 99 (ver §3) | **Sim** (setado 21/jul/2026 — POST sem token = 401) |
| `NINEFOOD_APP_ID` / `NINEFOOD_APP_SECRET` | API da 99 | — |
| `ANTHROPIC_API_KEY` | IA (diagnóstico) | — |
| (iFood client id/secret) | API do iFood | — |

---

## 3. Runbook — travar o webhook da 99food SEM downtime

O webhook `POST /api/webhooks/99food` é de **alto volume e vivo** (~33k eventos/mês, contínuo). A proteção é **progressiva**: fica aberto enquanto `NINEFOOD_WEBHOOK_SECRET` não existe; assim que o secret é setado, passa a **exigir** o token (`?token=` ou header `x-webhook-token`).

**Ordem correta pra ligar sem derrubar a conexão:**

1. **Portal da 99 primeiro:** muda a URL do webhook pra terminar com `?token=<SECRET>`.
   *(Enquanto o secret não está na Vercel, o código ignora esse token — não quebra nada.)*
2. **Vercel depois:** cria `NINEFOOD_WEBHOOK_SECRET=<SECRET>`.
   *(Ao subir, o código passa a exigir — e a 99 já manda o token desde o passo 1 → zero downtime.)*

⚠️ **Nunca inverta a ordem** (Vercel antes do portal) — abre uma janela de 401.

> Gerar um secret: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

---

## 4. Rotação de chaves (handoff)

**Nenhuma chave vazou** (nada em código/git/bundle) → nenhuma rotação obrigatória por exposição.
Ao passar o projeto pra outro dev, rotacionar por **higiene** (quem sai perde o acesso):

- [ ] `SUPABASE_SERVICE_ROLE_KEY` (Supabase → API → reroll)
- [ ] `ANTHROPIC_API_KEY`
- [ ] iFood client secret · `NINEFOOD_APP_SECRET`
- [ ] `ASAAS_WEBHOOK_TOKEN` · `CRON_SECRET` (opcional)
- [ ] Não precisa: `NEXT_PUBLIC_*` (públicos)

---

## 5. Pendências / recomendações residuais

- [x] ~~Travar o webhook da 99 seguindo o §3.~~ **FEITO 21/jul/2026** — secret na Vercel + `?token=` no portal; verificado (POST sem token → 401, sem downtime).
- [ ] (futuro) Policies de write (`WITH CHECK`) como defesa-em-profundidade.
- [ ] (futuro) Ambiente de **staging** pra permitir auditoria ofensiva ativa (hoje não dá sem tocar produção).
- [ ] Multi-atendimento com agentes por setor ("PASS") é **outro repo** (Cozina Atendimento) — auditar à parte se necessário.
