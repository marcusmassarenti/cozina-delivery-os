# Blindagem multi-tenant — isolamento de dados (Fase 0 da comercialização)

> Objetivo: garantir que, ao virar produto com **vários clientes**, a empresa A
> **nunca** veja dados da empresa B. É a fundação obrigatória antes de deixar um
> 2º cliente entrar.

## Estado atual (auditoria 2026-06-07)

### O modelo de tenancy já existe ✅
`holding → brand → unit`, com `user_unit_access` ligando usuário ↔ escopo, e
helpers RLS `has_holding_access / has_brand_access / has_unit_access`
(SECURITY DEFINER). Um cliente novo = uma **nova holding**.

### O RLS está correto, mas DORMENTE 🟡
Todas as tabelas de dados têm policy `using (has_unit_access(unit_id))` — o
banco *saberia* isolar. **Porém** toda a camada de dados (`src/lib/data/*`, 27
arquivos) lê via **`service_role`** (`createAdminClient`), que **ignora o RLS**.
Logo, hoje o RLS **não protege as leituras** — quem isola é o código.

### O isolamento real é app-layer, com um sentinel perigoso 🔴
`getAccessibleUnitIds()` (em `src/lib/auth/permissions.ts`):
- **franqueado** (scope unit) → array das lojas dele → **isolado**.
- **admin** (scope holding) → **`null`**, e `null` é interpretado em todo lugar
  como **"sem filtro = todas as lojas do banco"**.

→ **VAZAMENTO:** com um 2º cliente, o admin dele cai no `null` e enxerga os
dados de TODAS as empresas. Seguro hoje **só porque** só existe a Cozina
(`null` = "a Cozina" = correto).

### Pontos que dependem do sentinel `null = ver tudo`
- `src/lib/auth/permissions.ts` — origem (`getAccessibleUnitIds`)
- `src/lib/auth/guards.ts` → `requireUnitAccess` (`ids === null` → acessa qualquer loja)
- `src/lib/data/units.ts` → `getVisibleUnits` (`allowed === null` → retorna todas)
- Páginas: `page.tsx` (dashboard), `financeiro`, `avaliacoes`,
  `relatorios/ranking`, `relatorios/resultado`,
  `unidades/[codigo]/{page,relatorio,fechamento}` e `unidades/[codigo]/_actions`
  — todas fazem `accessibleIds === null ? (rede toda) : (filtra)`.
- Funções de rede (`filterUnitIds?: string[]`): quando recebem `undefined`,
  leem **todas** as lojas (sem filtro).

### Leituras sem escopo (corrigir também)
- `getUnitByCode(code)` → `.eq("code", code).maybeSingle()`. `code` é único só
  por `brand_id`; entre empresas **pode repetir** → com 2 tenants quebra
  (`maybeSingle` com 2 linhas) e/ou vaza. Precisa filtrar pelas units acessíveis.

---

## Plano de correção (Fase 0)

### 0.A — Super-admin explícito (✅ FEITO no código — migration 0039 a rodar)
Abordagem mais limpa que a inicial: em vez de mexer nos ~12 call-sites, o
sentinel `null = ver tudo` passa a valer **só pro super-admin da plataforma**.
- **Migration `0039_superadmin.sql`:** coluna `profiles.is_superadmin` +
  backfill que marca como super-admin quem HOJE vê a rede inteira (perfis de
  escopo `holding`). **Preserva 100% o comportamento atual.**
- **Código (`src/lib/auth/permissions.ts`):**
  - novo `isSuperadmin()` (lê `profiles.is_superadmin`, cacheado).
  - `getAccessibleUnitIds()`: se super-admin → `null` (vê tudo); senão →
    **sempre array concreto**, resolvendo `holding → brands → units` do usuário.
    Nunca mais "todas as lojas do banco" pra um admin de cliente.
  - re-exportado em `roles.ts` (`isSuperadmin`) pro painel de dono (Fase 1).
- Os ~12 call-sites **não mudam**: o ramo `null → tudo` agora só é alcançado
  pelo super-admin (correto). Os admins de cliente caem no array escopado.
- ⚠️ **Achado p/ a Fase 1:** `usuarios/_actions.ts → syncAccess()` fixa a
  holding em `slug='cozina-foods'` (linha ~139). O provisionamento de cliente
  vai precisar usar a holding correta de cada um.

### 0.B — Escopar as leituras sem filtro
- `getUnitByCode` e quaisquer agregadores que leem sem `filterUnitIds` passam a
  receber/aplicar as units acessíveis. Varredura função a função.

### 0.C — Defesa em profundidade (RLS de verdade nas leituras)
- O ideal de SaaS: as leituras de dados de tenant passarem pelo **client com
  RLS** (sessão do usuário), pra o **banco** garantir o isolamento mesmo se o
  código esquecer um filtro. Hoje tudo é `service_role`.
- Decisão: começar com a blindagem app-layer (0.A+0.B) — fecha o furo pros
  primeiros pilotos — e migrar as leituras sensíveis pra RLS **antes de escalar**
  pra muitos clientes. (Refactor maior, faseado.)

### 0.D — Teste com 2º tenant simulado
- Criar uma holding "fantasma" + 1 loja + 1 admin. Logar como admin dela e
  confirmar: **não vê** nada da Cozina; a Cozina **não vê** nada dela; franqueado
  continua só na própria loja.

---

## Princípio
O isolamento não pode depender de "o código lembrou de filtrar". A meta final é
o **banco garantir** (RLS nas leituras). Até lá, 0.A+0.B fecham o furo atual de
forma verificável, e a Cozina (único tenant hoje) **não muda de comportamento**.
