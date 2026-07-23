# Auditoria de Otimização Vercel — 2026-07-23

Cobre **dois projetos**: `cozina-delivery-os` (com telemetria) e `cozina-atendimento` (sem telemetria — auditoria estrutural). Diagnóstico apenas; **nenhum código foi alterado** nesta passada. Toda contagem vem de `grep`/`find`/leitura direta; onde o dado só existe no painel da Vercel, está marcado como **verificação manual**.

Telemetria de referência (só Delivery OS, último ciclo fechado): Build CPU **27h12m** (crítico), Function invocations **687K/1M (69%)**, Fluid active CPU **5h40m/16h (35%)**. Banda/CDN em 0,3–6% da franquia — **ignorados por decisão do escopo**.

---

## PROJETO A — cozina-delivery-os

### A.1 Sumário executivo

> **CORREÇÃO 1 (confirmado no painel):** os dois projetos **já estão na máquina Standard** (a mais barata; "Fallback"). A hipótese DO-1 (Turbo caro) está **descartada**.
>
> **CORREÇÃO 2 (confirmado na doc do Next 16 — `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:116,1095`):** no Next 16, **`next build` NÃO roda mais ESLint** (o lint saiu do build) e **usa Turbopack por padrão** (compilador rápido). Ou seja, as duas otimizações de build que a auditoria propôs (tirar lint / usar Turbopack) **já estão feitas de fábrica**. A única checagem que o `next build` ainda roda é o **type-check do TypeScript** — que **deve permanecer**: no fluxo direto-na-`main` (sem PR gate) é a única barreira que impede um deploy quebrado. O CI (`security.yml`) roda `tsc --noEmit`, mas **depois** do push (informativo, não bloqueia).

- **Build CPU (27h12m):** com máquina no tier certo + Next 16 já sem lint no build + Turbopack default, **não há mudança de código segura a aplicar**. O type-check fica (é a rede de segurança). As 27h são **volume de deploys** (muitos pushes diretos na `main` — ~15-18/dia no histórico) × duração do build. A única alavanca real é **reduzir a frequência de deploy** (agrupar commits / usar branch de trabalho antes de mesclar na main) — decisão de fluxo, não de código. `ignoreCommand` (pular build de commit só-docs) tem ganho marginal e risco de pular build errado; **não recomendado** dado que quase todo commit toca código.
- **Invocations (69%):** **não há polling no cliente** (vetor limpo — achado positivo). O volume vem de navegação real × **middleware que faz `supabase.auth.getUser()` (chamada de rede) em toda página**. Reduzir isso é a maior alavanca, mas é **alto risco multi-tenant** (auth/sessão) — item de estudo, não de aplicação imediata.
- **Active CPU (35%):** concentrado em **agregação financeira pesada em JS** (`ifood-imported.ts`, 2.324 linhas) e no **fan-out de ~10 RPCs/mês** de `relatorio-rede.ts` sem `React.cache`.
- **Ociosos:** Image Optimization, Web Analytics e Observability estão zerados e o código não usa nenhum — Analytics e Observability podem ser ligados de graça; Image Optimization pode ficar desligada.

### A.2 Inventário (Fase 0)

| Item | Valor | Fonte |
|---|---|---|
| Next.js / React | 16.2.6 / 19.2.4 | `package.json:15,18` |
| @supabase/ssr · supabase-js | ^0.10.3 · ^2.106.2 | `package.json:6-7` |
| Gerenciador / lockfile | npm · só `package-lock.json` | raiz |
| Monorepo? | Não (sem workspaces/turbo.json) | — |
| Middleware | `src/middleware.ts` + helper `src/lib/supabase/middleware.ts` | `find` |
| page.tsx / route.ts | 73 / 16 | `find` |
| `"use server"` / `"use client"` | 27 / 152 arquivos | grep |
| Dockerfile / `output:'standalone'` | Não existe / ausente | — |
| Crons (vercel.json) | 3 (todos 1×/dia) | `vercel.json` |
| `.env.example` | **não existe** (27 env vars não documentadas) | — |

`vercel.json` hoje: **só `crons`** (sem `buildMachineType`, `ignoreCommand`, `functions`, `regions`). `next.config.ts`: sem `output`, `images`, `optimizePackageImports`, `outputFileTracingExcludes`, `ignoreBuildErrors`/`ignoreDuringBuilds`; só `serverActions.bodySizeLimit:"30mb"` + headers de segurança.

### A.3 Achados priorizados

| ID | Achado | Métrica | Impacto estimado | Esforço | Risco regressão | Prio |
|---|---|---|---|---|---|---|
| **DO-1** | ~~`buildMachineType` → Turbo~~ **DESCARTADO: já está em Standard** | Build CPU | — | — | — | **N/A** |
| **DO-3** | ~~Tirar lint/typecheck do build~~ **DESCARTADO:** Next 16 já tirou o lint do build; typecheck é a rede de segurança do direto-na-main (não tirar) | Build CPU | — | — | Alto se removido | **N/A** |
| **DO-2** | ~~`ignoreCommand`~~ ganho marginal + risco de pular build errado | Build CPU | ~0 | Baixo | Médio | **N/A** |
| **DO-10** | **Reduzir frequência de deploy** (agrupar commits antes da main) — única alavanca real de build | Build CPU | Proporcional à redução de pushes | — (hábito) | Nenhum | **P1 (fluxo)** |
| **DO-4** | Middleware faz `getUser()` de rede em toda navegação | Invocations + CPU | Alta (é a fonte dominante), mas não quantificável sem breakdown por rota | Médio | **Alto (multi-tenant/auth)** | **P1 ⚠️** |
| **DO-5** | Leituras reusadas sem `React.cache` (relatorio-rede, ifood-imported) | Active CPU + Invocations | Corta re-queries por render; ganho médio | Baixo | Baixo-médio | **P1** |
| **DO-6** | Agregação financeira pesada em JS (`ifood-imported.ts`) | Active CPU | Alta (driver principal de CPU), mas exige medir por-função | Alto | Médio | **P2** |
| **DO-7** | `optimizePackageImports` p/ lucide-react (207 imports) | Build CPU + bundle | Pequeno-médio | Baixo | Baixo | **P2** |
| **DO-8** | Ligar Web Analytics + Observability (inclusos, uso 0) | — (recurso ocioso) | Ganho de diagnóstico, custo 0 | Baixo | Baixo | **P2** |
| **DO-9** | `.env.example` + `output:standalone` + Dockerfile | Portabilidade | Reduz lock-in; sem efeito em consumo | Baixo-médio | Baixo | **P2** |

### A.4 Detalhamento por achado

#### DO-1 — `buildMachineType` (P0, verificação manual obrigatória)
- **Onde:** `vercel.json` (não declara). Confirmar tier atual em **Vercel → Settings → Build & Deployment → Build Machine**.
- **Por quê:** desde fev/2026 o padrão da conta é **Turbo** (US$ 0,105/min) contra **Standard** (US$ 0,014/min). Builds < 5 min raramente justificam Turbo.
- **Proposta (após medir o wall-clock de um build real no painel):** se o build fecha em poucos minutos, fixar Standard:
  ```json
  // vercel.json
  { "buildMachineType": "standard", "crons": [ /* ...os 3 atuais... */ ] }
  ```
- **Validação:** rodar 1 deploy, ler o wall-clock. Se subiu pouco (ex.: de 4 → 6 min) mas o custo/min caiu 7,5×, é ganho líquido enorme. Observar "Build CPU" no próximo ciclo.

#### DO-2 — `ignoreCommand` (P0)
- **Onde:** `vercel.json` (ausente) + "Ignored Build Step" no painel (**verificar** — se "Automatic", pode já pular alguns; confirmar).
- **Proposta (projeto único, não-monorepo):** pular build quando o diff não toca código que afeta o app:
  ```json
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ':!**/*.md' ':!docs/**' ':!.github/**' ':!*.md'"
  ```
  (retorno 0 = sem mudanças relevantes = pula o build.)
- **Validação:** commitar só um `.md` e confirmar no painel que o deploy foi "skipped".

#### DO-3 — Lint/typecheck no build (P1)
- **Onde:** `package.json:11` `"build": "TZ=America/Sao_Paulo next build"`; `next.config.ts` não desliga lint/TS. O CI (`.github/workflows/security.yml`) já roda `tsc --noEmit` em todo push/PR.
- **Proposta:** deixar o gate de tipos/lint **só no CI** e tirar do build:
  ```ts
  // next.config.ts
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  ```
- **Risco:** só é seguro **se o CI bloquear merge** com type-error. Hoje o workflow roda mas confirmar que é *required check* no GitHub. Sem isso, um erro de tipo chega a produção.
- **Validação:** medir wall-clock de build antes/depois; confirmar CI vermelho barra merge.

#### DO-4 — Middleware `getUser()` por request (P1, ⚠️ alto risco multi-tenant)
- **Onde:** `src/middleware.ts:37` → `src/lib/supabase/middleware.ts:28-30` (`await supabase.auth.getUser()` = round-trip ao Auth do Supabase por request coberto pelo matcher). Matcher (`src/middleware.ts:41-46`) já exclui `_next/static`, `_next/image`, favicon e extensões de imagem — **bom**; o custo não é o matcher, é o I/O por navegação.
- **Por quê:** cada navegação App Router dispara middleware (1 invocation) + o `getUser()` de rede (latência + Active CPU). É a fonte estrutural dominante das invocations.
- **Proposta (a validar com cuidado):** manter `getUser()` de rede só no ramo que decide a landing logada (`middleware.ts:23-35`); no resto, refrescar o cookie de sessão sem round-trip e deixar a verificação forte no layout autenticado (Server Component), que já roda `getCurrentUserContext()` cacheado.
- **⚠️ Regressão multi-tenant:** qualquer mudança em auth no middleware pode vazar sessão entre tenants ou deixar rota protegida aberta. **Exige teste de isolamento** (logar como tenant A, tentar acessar rota/dado de B) antes de qualquer merge. **Não aplicar sem esse teste.**
- **Validação:** breakdown de invocations por rota no painel (Observability) antes/depois; suíte de isolamento de tenant.

#### DO-5 — `React.cache` em leituras reusadas (P1)
- **Onde:** `src/lib/data/relatorio-rede.ts` (`getNetworkReportForMonth`/`ForRange` sem `cache()`); `src/lib/data/ifood-imported.ts` só envolve `getCancelamentoCestaForMonth` (`:1374`), o resto não. A camada de auth (`src/lib/auth/permissions.ts`, `context.ts`) já usa `cache()` corretamente — seguir o mesmo padrão.
- **Proposta:** envolver as funções de leitura mais reusadas por render em `import { cache } from "react"`. Dedup por-request, sem risco de dados obsoletos (é escopo de 1 render).
- **Validação:** contar queries por página no log do Supabase antes/depois numa tela pesada (ex.: `/relatorios/resultado`).

#### DO-6 — Agregação financeira em JS (P2)
- **Onde:** `src/lib/data/ifood-imported.ts` (2.324 linhas, 50 `.from(`, laços `for…for` montando Maps de cesta/perda em `:1361-1363`, `:1448-1449`, `:2044-2045`, etc.). `relatorio-rede.ts:100-115` faz fan-out de ~10 RPCs/mês (12 meses ≈ 120 RPCs).
- **Proposta:** empurrar somatórios/rankings para RPC no Postgres (o padrão já existe em `relatorio-rede.ts`, só não está aplicado no `ifood-imported`). Medir por-função qual domina antes de reescrever.
- **Validação:** GB-hours/duração por função no painel; comparar antes/depois numa tela de Diagnóstico/Resultado.

#### DO-7 — `optimizePackageImports` (P2)
- **Onde:** `next.config.ts` (ausente); lucide-react importado em 207 locais (nomeados, mas sem tree-shake do barrel).
- **Proposta:** `experimental: { optimizePackageImports: ["lucide-react"] }`.
- **Validação:** tamanho do bundle e wall-clock de build antes/depois.

#### DO-8 — Recursos ociosos (P2)
- Image Optimization: 0 `next/image`, 10 `<img>` (decisão documentada no CLAUDE.md — manter). **Nada a fazer além de confirmar que está desligada no painel.**
- Web Analytics (`@vercel/analytics`) e Observability/Runtime Logs: **não instalados**. Ambos inclusos no plano; ligar dá diagnóstico grátis (o breakdown de invocations do DO-4 depende da Observability).

#### DO-9 — Portabilidade (P2)
- Sem `@vercel/kv|blob|postgres|edge-config` (bom). Falta `.env.example` (27 vars listadas na §A.2-fonte), `output:'standalone'` e Dockerfile para build self-host portável.

### A.5 Plano de execução (por PR) — Delivery OS

> **Regra:** nunca misturar mudança de build com mudança de runtime no mesmo PR.

- **PR-1 (build):** DO-1 + DO-2 + DO-7 — `vercel.json` (`buildMachineType`, `ignoreCommand`) + `optimizePackageImports`. Só depois de confirmar o tier e o wall-clock no painel.
- **PR-2 (build/CI):** DO-3 — desligar lint/TS no build **após** confirmar que o CI é required check.
- **PR-3 (runtime, baixo risco):** DO-5 — `React.cache` nas leituras reusadas.
- **PR-4 (runtime, alto risco — isolado):** DO-4 — middleware. **Com teste de isolamento multi-tenant obrigatório.** Nunca junto de outra mudança.
- **PR-5 (runtime, esforço alto):** DO-6 — agregações → RPC. Medir antes.
- **PR-6 (infra/diagnóstico):** DO-8 (Analytics/Observability) + DO-9 (env.example/standalone/Dockerfile).

### A.6 Baseline de validação (Delivery OS)
- **Build CPU:** ver no painel após PR-1/PR-2/PR-3. Efeito aparece **no próximo deploy** (tier/ignore) e acumula no ciclo. Meta: −50%+.
- **Invocations:** breakdown por rota (Observability, ligar no DO-8) — confirma que middleware+RSC dominam. Efeito do PR-4 no ciclo seguinte. Meta: <40%.
- **Active CPU:** GB-hours/função antes/depois de PR-3/PR-5. Meta: −30%.

---

## PROJETO B — cozina-atendimento

> **Sem telemetria de consumo** (Invocations/CPU/Build não fornecidos). Auditoria **estrutural**; onde há número de invocations, é **fórmula `intervalo × usuários`, não medição**.

### B.1 Sumário executivo
App de **chat ao vivo** — o ponto sensível é invocations. **Boa notícia:** usa **Supabase Realtime** como canal primário (não custa invocation Vercel), o matcher do middleware é bem-feito, e a transcrição de áudio está bem isolada. **Ponto a corrigir:** vários **polls a Server Actions** rodando de fundo o tempo todo, o pior sendo um poll de **30s redundante com o Realtime** e um de **5s que não pausa quando já conectado**. Estimativa ilustrativa: ~216 invocations/hora por atendente **parado**, ~380k/mês com 10 atendentes — **fórmula, não medido**. Build e portabilidade estão saudáveis.

### B.2 Inventário (Fase 0)

| Item | Valor |
|---|---|
| Next.js / React | 16.2.9 / 19.2.4 |
| @supabase/ssr · supabase-js | ^0.12.0 · ^2.108.1 |
| Deps runtime extra | `web-push ^3.6.7` |
| Middleware | `proxy.ts` (rename Next 16) + `lib/supabase/proxy.ts` |
| page.tsx / route.ts | 23 / 7 |
| `"use server"` / `"use client"` | 9 / 40 |
| Crons | **0** (vercel.json só `regions:["gru1"]`) |
| Dockerfile / `standalone` | Não / Não |
| `.env.example` | Existe (faltam algumas vars — ver AT-5) |

### B.3 Achados priorizados

| ID | Achado | Métrica | Impacto (estimado, fórmula) | Esforço | Risco | Prio |
|---|---|---|---|---|---|---|
| **AT-1** | `getTeamUnreadTotal` a cada 30s (global) redundante com Realtime | Invocations | ~120 inv/h/usuário — maior gasto de fundo | Baixo | Baixo-médio | **P0** |
| **AT-2** | `getConnectionAction` a cada 5s não pausa conectado/oculto | Invocations | ~720 inv/h por aba aberta (página rara) | Baixo | Baixo | **P1** |
| **AT-3** | `getOverdueAlert` 60s (global) sem guarda `document.hidden` | Invocations | ~60 inv/h/usuário com aba oculta | Baixo | Baixo | **P1** |
| **AT-4** | `api/agenda/feed/[token]` `force-dynamic` polado por apps de calendário | Invocations | 1 inv por refresh de cada assinante | Baixo | Baixo | **P2** |
| **AT-5** | `.env.example` sem `CRON_SECRET`, `FILA_*`, VAPID keys | Portabilidade | — | Baixo | Baixo | **P2** |
| **AT-6** | Sem Ignored Build Step | Build | — (sem telemetria) | Baixo | Baixo | **P2** |

### B.4 Detalhamento por achado

#### AT-1 — poll de 30s redundante (P0)
- **Onde:** `components/app-shell.tsx:284` — `setInterval(getTeamUnreadTotal, 30_000)`, **global** (app-shell envolve toda página autenticada). No **mesmo `useEffect`** já existe o canal Realtime `team-unread` (`app-shell.tsx:269`, `postgres_changes` em `internal_messages`) que também chama `load()` no insert. O comentário chama o poll de "rede de segurança".
- **Por quê:** ~120 invocations/h por usuário logado, mesmo sem atividade — e o dado já chega pelo Realtime.
- **Proposta:** elevar o intervalo da rede-de-segurança para **5 min** (ou remover, confiando no Realtime + reconexão). Manter guarda `document.hidden`.
- **Risco:** baixo-médio — se o Realtime cair sem reconectar, o contador de não-lidas pode atrasar até o próximo tick. 5 min mitiga.
- **Validação:** com o Realtime funcionando, o contador continua atualizando ao receber msg interna; simular queda do canal e confirmar recuperação no tick.

#### AT-2 — poll de 5s da conexão (P1)
- **Onde:** `components/connection-manager.tsx:24` — `setInterval(getConnectionAction, 5_000)`; serve pra renovar o QR enquanto desconectado, mas **não pausa** quando `connected === true` nem quando a aba está oculta.
- **Proposta:** `if (connected || document.hidden) return` dentro do tick (ou limpar o interval ao conectar). Página de setup raramente aberta, mas 720 inv/h/aba quando fica.
- **Validação:** abrir a tela de conexão já conectado e confirmar no Network que os POSTs param.

#### AT-3 — `getOverdueAlert` sem guarda de visibilidade (P1)
- **Onde:** `components/app-shell.tsx:240` — 60s, global, sem `document.hidden`. Os pares (`/api/version` `:374`, `connection-badge.tsx:29`, `inbox.tsx:988`) **já têm** a guarda — só padronizar.
- **Proposta:** adicionar `if (document.hidden) return` no tick.
- **Validação:** deixar aba oculta e confirmar que os POSTs pausam.

#### AT-4 — feed de agenda cacheável (P2)
- **Onde:** `app/api/agenda/feed/[token]/route.ts` — `dynamic="force-dynamic"`. Apps de calendário (Apple/Google) fazem polling agressivo (5–15 min/assinante).
- **Proposta:** `Cache-Control: s-maxage=300` para os refreshes baterem no CDN em vez de invocar função. (Isto **é** cache de borda, mas aqui reduz *invocations* — dentro do escopo, não é otimização de banda.)
- **Validação:** header de resposta + `x-vercel-cache: HIT` nos refreshes seguintes.

#### AT-5 / AT-6 — env + build (P2)
- `.env.example` não documenta `CRON_SECRET`, `FILA_LOTE/INTERVALO_MS/HORA_INICIO/HORA_FIM/DOMINGO` (`api/erp/processar-fila/route.ts:11-25`) e as **VAPID keys** do web-push (`lib/push.ts`). Documentar.
- Sem `ignoreCommand` — considerar só se build minutes incomodarem (sem telemetria, baixa prioridade).

### B.5 Já bem-feito (não mexer)
Matcher do `proxy.ts` (exclui estáticos, manifest, robots, sitemap, imagens); guarda de `document.hidden` em version/connection-badge/inbox; transcrição isolada em `iad1` com teto de 60s (`api/transcribe`); Realtime como canal primário; `<img>` cru correto (mídia via Supabase Storage); zero acoplamento a storage proprietário Vercel.

### B.6 Plano de execução (por PR) — Atendimento
- **PR-1 (invocations, alto ganho):** AT-1 + AT-3 (`app-shell.tsx`) + AT-2 (`connection-manager.tsx`) — todos são guarda/intervalo de poll, baixo risco, mesmo tema.
- **PR-2 (invocations, borda):** AT-4 — `Cache-Control` no feed de agenda.
- **PR-3 (infra):** AT-5 (env.example) + AT-6 (ignoreCommand, se aplicável).

### B.7 Baseline de validação (Atendimento)
- **Instrumentar primeiro:** ligar **Observability/Usage** da Vercel e observar ~1 semana com o nº real de atendentes simultâneos — sem isso as estimativas são fórmula. Depois do PR-1, o piso de invocations de fundo deve cair na proporção dos polls removidos (AT-1 sozinho ≈ −55% do fundo global).

---

## Verificações manuais pendentes (painel Vercel — não visíveis no repo)

1. **[DO-1] ✅ RESOLVIDO** — os dois projetos já estão em **Standard** (confirmado no painel 2026-07-23). Sem ação.
2. **[DO-2]** Estado do "Ignored Build Step" (Automatic/vazio → todo commit builda).
3. **[DO-3]** Confirmar que o workflow de CI é **required check** no GitHub antes de tirar TS/lint do build.
4. **[DO-8]** Se Image Optimization / Analytics / Observability estão ligados no projeto (código não usa nenhum).
5. **[Ambos]** Breakdown de **invocations por rota** e **GB-hours por função** (Observability) — necessário pra quantificar DO-4/DO-6 e validar as estimativas do Atendimento.
6. **[Atendimento]** Não há telemetria de consumo — instrumentar Usage/Observability por ~1 semana antes de priorizar por número.

## Regras honradas nesta auditoria
- Nada de otimização de banda/CDN/edge cache (consumo 0,3–6%) — exceto AT-4, que usa borda **para reduzir invocations**, não banda.
- Itens de auth/middleware/cache marcados com **risco de regressão multi-tenant** (DO-4 exige teste de isolamento).
- Estimativas de invocations do Atendimento declaradas como **fórmula, não medição**.
- Nenhum arquivo de código foi alterado nesta passada.
