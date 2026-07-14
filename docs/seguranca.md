# Segurança — Cozina Delivery OS

Resumo da postura de segurança + runbook operacional. Base pra handoff.
Última auditoria: **14/jul/2026** (recon + verificação estática/DB read-only, sem teste ofensivo — não há ambiente de staging).

---

## 1. Postura atual (auditado)

| Área | Estado |
|---|---|
| **RLS (multi-tenant)** | ✅ Todas as 67 tabelas do `public` com RLS ligada. 52 policies, 100% escopadas por `has_unit_access` / `has_holding_access` / `has_brand_access` / `auth.uid()`. Zero `using(true)`, zero acesso `anon`. |
| **Funções SECURITY DEFINER** | ✅ As 13 fixam `search_path=public` (sem hijack). |
| **service_role / secrets** | ✅ Só server-side (`lib/supabase/admin.ts` com `import "server-only"`). Nenhum em componente `"use client"`. `.env` nunca commitado; `.gitignore` cobre `.env*`. |
| **`NEXT_PUBLIC_*`** | ✅ Só `SUPABASE_URL` e `ANON_KEY` (públicos por design). |
| **API do ERP (v1)** | ✅ `verifyApiKey` (chave em **hash SHA-256**) + escopo por unidades do `api_client`. |
| **Webhook Asaas (pagamento)** | ✅ Valida `asaas-access-token` com `timingSafeEqual` + **fail-closed** + idempotência (`asaas_processed_events`). |
| **Crons** | ✅ Exigem `Authorization: Bearer <CRON_SECRET>` (fail-closed). |
| **IA (diagnóstico)** | ✅ `system` em role separada, saída validada como JSON, sem secret no contexto. + regra anti-injection (trata dado/reviews como conteúdo, nunca instrução). |
| **Webhook 99food** | ⚠️ Proteção **progressiva** (ver §3). Só enfileira eventos (não é pagamento). |

**Nenhum P0/P1 explorável encontrado.** Só 2 P2 (webhook 99 + hardening da IA), ambos tratados.

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
| `NINEFOOD_WEBHOOK_SECRET` | Trava o webhook da 99 (ver §3) | Não (progressivo) |
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

- [ ] (opcional) Travar o webhook da 99 seguindo o §3.
- [ ] (futuro) Policies de write (`WITH CHECK`) como defesa-em-profundidade.
- [ ] (futuro) Ambiente de **staging** pra permitir auditoria ofensiva ativa (hoje não dá sem tocar produção).
- [ ] Multi-atendimento com agentes por setor ("PASS") é **outro repo** (Cozina Atendimento) — auditar à parte se necessário.
