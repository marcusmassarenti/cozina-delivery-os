@AGENTS.md

# Cozina Delivery OS — Guia do Projeto

SaaS proprietário pra monitorar operação de delivery (iFood / 99 Food / Keeta) das franquias da rede **Churrasco no Pote** (Cozina Foods). Cada unidade é uma franquia; a holding consolida tudo.

---

## 1. Stack e versões

- **Next.js 16.2.6** com App Router + Turbopack
  - ⚠️ Versão com breaking changes. Antes de assumir uma API, ler `node_modules/next/dist/docs/`.
- **React 19** (Server Components default + `useActionState` / `useFormStatus`)
- **shadcn/ui v4** — baseado em **Base UI**, **NÃO Radix**
  - Trigger usa prop `render` (não `asChild`)
  - `Select.onValueChange` é `(value: string | null, eventDetails) => void`
- **Tailwind v4** com `@theme inline`
- **Supabase** — Postgres + Auth + RLS
- **Fonte:** Inter
- **Locale:** pt-BR (Intl.NumberFormat, toLocaleDateString)
- **Deploy:** Vercel (auto-deploy no push da `main`)

---

## 2. Arquitetura

### Multi-tenancy em 3 escopos
```
holding ─┐
         ├─ brand ─┐
         │        ├─ unit (franquia)
         │        └─ unit
         └─ brand …
```

Usuário acessa via `user_unit_access`:
- **Administrador** — vê toda a holding
- **Franqueado** — vê só a(s) unidade(s) vinculada(s)

### Route groups
- `src/app/(app)/` — rotas autenticadas, com shell (sidebar + header)
- `src/app/login/` — fora do shell

### Camadas
```
src/
├─ app/(app)/             # páginas (Server Components default)
│  ├─ page.tsx            # Dashboard
│  ├─ unidades/
│  │  ├─ page.tsx         # listagem + filtros
│  │  ├─ _actions.ts      # server actions (create/update/delete)
│  │  ├─ _components/     # dialogs, tabelas
│  │  └─ [codigo]/        # detalhe da unidade
│  │     └─ lancamentos/  # diário + mensal
│  └─ administracao/
│     └─ usuarios/        # gestão de usuários
├─ lib/
│  ├─ data/               # queries (server-only)
│  │  ├─ units.ts
│  │  └─ lancamentos.ts   # ← agregador real (sumiu mock do dashboard)
│  ├─ supabase/
│  │  ├─ server.ts        # client anon p/ auth
│  │  └─ admin.ts         # service_role (server-only)
│  ├─ mock-monthly.ts     # tipo UnitMonthly + emptyMonthly
│  └─ format.ts           # fmtBRL, fmtBRLShort, fmtNum, fmtPct
└─ components/
   ├─ dashboard/
   ├─ shared/
   └─ ui/                 # shadcn v4 (Base UI)
```

---

## 3. Padrões de código

### Server Actions
- Arquivo `_actions.ts` por rota, com `"use server"` no topo
- Retornam `{ ok, message?, fieldErrors? }` (`CreateUnitState`)
- Cliente consome via `useActionState(action, initial)` + `useFormStatus()` no botão
- Sucesso → `router.refresh()` no `useEffect`

### Server vs Client Components
- Default = Server Component
- `"use client"` só quando precisa: hooks, eventos, estado, refs
- `import "server-only"` em qualquer módulo que toca `service_role`

### Supabase
- **Anon client** (`@/lib/supabase/server`) → auth do usuário (RLS aplicada)
- **Admin client** (`@/lib/supabase/admin`) → queries cross-tenant, criação de users
- Service role **NUNCA** com prefixo `NEXT_PUBLIC_`, **NUNCA** comitada — só `.env.local` + Vercel env vars

### Forms com Base UI
- `Select` → wrappar `onValueChange` com null coalescing:
  ```tsx
  <Select value={uf} onValueChange={(v) => setUf(v ?? "SP")}>
  ```
- `DialogTrigger` → usar `render={<button …/>}`, não children
- Checkboxes nativos pra `<input type="checkbox" name="platforms" value="…" />` (form action lê tudo)

### Imagens
- `<img>` direto (sem `next/image`) pros logos das plataformas — Content-Disposition do next/image dava attachment
- `PlatformLogo` é `"use client"` por causa do `onError`

### Formatação
```ts
fmtBRL(1234.5)      // R$ 1.234,50
fmtBRLShort(1234500) // R$ 1,2 mi
fmtNum(190)         // 190
fmtPct(62.5)        // 62,5%
```

---

## 4. Modelo de dados

### Migrations aplicadas
| # | Arquivo | O que faz |
|---|---|---|
| 0001 | `init.sql` | `holdings`, `brands`, `units`, `user_unit_access` + helpers RLS (`has_holding_access`, `has_brand_access`, `has_unit_access` com SECURITY DEFINER) |
| 0002 | `unit_platforms.sql` | M2M `(unit_id, platform IN (ifood/99food/keeta), active)` |
| 0003 | `profiles.sql` | `profiles` + trigger em `auth.users` que auto-cria profile |
| 0004 | `lancamentos.sql` | `daily_entries` (unit_id, date, platform, pedidos, cancelados, faturamento) + `monthly_entries` (custos, nota, observações) |
| 0005 | `monthly_platform_entries.sql` | Taxas / VR / cancelamentos por plataforma por mês |
| 0006 | `total_recebido_real.sql` | Coluna `total_recebido_real` em `monthly_entries` |

### Agregador real (`getRealMonthlyForUnits`)
Em `src/lib/data/lancamentos.ts`. Junta as 3 tabelas (daily + monthly + monthly_platform) e devolve `Map<unitId, UnitMonthly>` compatível com o dashboard.

Regras de negócio embutidas:
- **VR Líquido** = `VR Recebido * 0.92` (taxa auto de 8%)
- **Total Recebido (por plataforma)** = `Bruto − taxas + VR Líquido + cancelamentos`
- Usa `total_recebido_real` quando > 0; senão, calcula
- **CMV** dividido em Cozina + Loja, com alerta visual quando **soma > 40%** (só a soma, não cards individuais)

---

## 5. Decisões importantes (com motivo)

| Decisão | Por quê |
|---|---|
| 2 perfis (Administrador + Franqueado), não 4 | Marcus pediu: holding ou loja. Sem nuance. |
| Código de unidade arbitrário (string) | Marcus: "qualquer coisa serve, é interno" |
| CNPJ opcional, mascarado no input | Unidade nova pode ainda não ter CNPJ formalizado |
| 1 bloco com seletor de plataforma (Mensal) | Marcus reclamou da duplicação de 3 cards iguais |
| Faturamento Real Recebido manual | Quando preenchido, sobrepõe o calculado pra margem |
| Alerta CMV só na soma (não Cozina/Loja isolado) | Marcus: "O alerta tem que ser a soma do Cozina + Loja" |
| Dashboard lê dados reais (sem mock) | Última task entregue — mock só sobra como `emptyMonthly` fallback |

---

## 6. Bugs resolvidos (e como)

| Sintoma | Causa | Fix |
|---|---|---|
| `git push` falhando com "fatal error in commit_refs" | Bug HTTP/2 do GitHub | `git config http.version HTTP/1.1` |
| Logo das plataformas vinha com `Content-Disposition: attachment` | next/image rota `/next/image` | Trocar por `<img>` direto |
| Collapsible chevron não girava | base-ui usa `data-open`/`data-closed`, não `data-panel-open` | `group-data-[closed]/collapsible:-rotate-90` |
| Build Vercel falhando em `edit-unit-dialog.tsx:148` | `onValueChange` aceita `string \| null`, `setUf` só `string` | Wrappar: `(v) => setUf(v ?? "SP")` (em 4 arquivos) |
| Linha de `/unidades` parou de navegar após refactor | `onClick` foi perdido | `onClick={() => router.push(...)}` na `<tr>` + `e.stopPropagation()` nos botões |
| Coluna Cidade/Plataformas desalinhada | `grid-template-columns` última coluna `auto` | Travar em `108px` |
| `onError` no `<img>` num Server Component | Handler precisa de cliente | Adicionar `"use client"` em `PlatformLogo` |

---

## 7. Convenções de commit

Mensagens em **pt-BR**, imperativo, escopo na frente:
```
Dashboard agora lê dados reais dos lançamentos
Fix build: tipa onValueChange dos Select pra aceitar string|null
CMV: alerta baseado só na soma Cozina + Loja (Total)
Mensal: consolidação das 3 plataformas + Faturamento Real Recebido
```

Sempre criar **novo commit** (nunca `--amend` automaticamente). Co-author no rodapé quando pedir commit.

---

## 8. Próximos passos disponíveis

Marcus ainda não escolheu o próximo. Opções sobre a mesa:

- 🔐 **Restrição franqueado** — RLS real, franqueado só vê própria unidade
- 📊 **Gráficos** com Recharts no Dashboard
- 📅 **Filtro de período** no Dashboard (hoje só mostra mês corrente)
- 🗂 **Páginas placeholder** dos 404 no menu (Alertas, Plataformas, Produtos, Avaliações, Conexões, Configurações, Resultado)
- 🔌 **Integração iFood API**

Aguardar Marcus escolher antes de partir pra qualquer um.

---

## 9. Como Marcus quer ser conduzido

- **Perguntas como opções clicáveis** (`AskUserQuestion`), não texto livre
- Passo a passo, didático mas não raso
- Quando tiver opção recomendada, marca como "(Recomendado)" e põe primeiro
- Visual: compacto, single-block com seletor > múltiplas seções repetidas
- Logo das plataformas sempre que fizer sentido
