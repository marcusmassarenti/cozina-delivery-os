# SESSION_NOTES — Estado atual do Cozina Delivery OS

> Snapshot pra retomar o trabalho sem precisar reler a sessão inteira.
> Última atualização: 2026-05-28
> Último commit: `a94a236 Dashboard agora lê dados reais dos lançamentos`

---

## TL;DR

Sistema funcional end-to-end pra **uma unidade**: cadastro, lançamento diário, fechamento mensal, dashboard agregado lendo dados reais. Falta endurecer permissões pro perfil Franqueado e enriquecer o dashboard (gráficos / filtro de período). Integração com APIs das plataformas ainda não começou.

---

## O que já funciona (pode usar em produção)

### Autenticação
- ✅ Login real via Supabase Auth (`/login`)
- ✅ Logout (botão direto como `<button type="submit">`)
- ✅ Trigger em `auth.users` cria profile automaticamente
- ✅ Service role isolado em `src/lib/supabase/admin.ts` com `import "server-only"`

### Gestão de Usuários — `/administracao/usuarios`
- ✅ Listar usuários (admin)
- ✅ Criar usuário (Administrador ou Franqueado vinculado a unidade)
- ✅ Editar perfil e vínculo
- ✅ Remover usuário

### Gestão de Unidades — `/unidades`
- ✅ Lista com filtros (status, busca)
- ✅ Criação via modal (nome, cidade, UF, CNPJ opcional, plataformas)
- ✅ Edição inline (lápis na linha)
- ✅ Delete
- ✅ Logo das 3 plataformas centralizadas
- ✅ Linha clicável → navega pro detalhe

### Detalhe da Unidade — `/unidades/[codigo]`
- ✅ Cabeçalho com logo do Cozina + dados
- ✅ KPIs de Volume por plataforma (iFood / 99 / Keeta)
- ✅ Tabs: **Lançamentos diário** + **Mensal** + **Resultado**

### Lançamento Diário (tab)
- ✅ Por plataforma, com seletor
- ✅ Campos: pedidos, cancelados, faturamento bruto
- ✅ KPIs calculados em tempo real (ticket médio, % cancelamento)
- ✅ Salva em `daily_entries`

### Mensal (tab)
- ✅ Um único bloco com **seletor de plataforma** (iFood / 99 / Keeta)
- ✅ Campos por plataforma: taxas, VR Recebido, VR Líquido (auto = `VR * 0.92`), cancelamentos (soma)
- ✅ **Consolidação** das 3 plataformas com logos no header
- ✅ **Faturamento Real Recebido** (campo manual; quando preenchido sobrepõe o calculado pra margem)
- ✅ Salva em `monthly_entries` + `monthly_platform_entries`

### Resultado do mês (tab)
- ✅ KPIs: CMV (Cozina + Total), margem, etc
- ✅ CMV em **3 cards** (Cozina / Loja / Total)
- ✅ Tone semafórico: ≤30% ok, ≤40% warning, >40% error
- ✅ **Alerta visual** quando `cmvTotalPct > 40` (só na soma — Marcus foi explícito)
- ✅ Confirmação visual quando saudável

### Dashboard — `/`
- ✅ **Lê dados reais** dos lançamentos do mês corrente (via `getRealMonthlyForUnits`)
- ✅ 6 KPIs (Pedidos, Média/Dia, Ticket, Bruto, Líquido, Taxa Repasse)
- ✅ Visão por plataforma (rede) com barra de % líquido pra loja
- ✅ Tabela detalhada por unidade
- ✅ Data dinâmica (`toLocaleDateString pt-BR`)
- ✅ Status badge mostra "Supabase conectado · dados reais do mês corrente"

---

## Estado dos dados (em produção)

Última verificação no dashboard mostrou:
- **190 pedidos**, **R$ 10k bruto**
- Quebra: iFood R$ 2k, 99 R$ 3k, Keeta R$ 5k

Confirma que o agregador real está rodando.

---

## Arquivos críticos pra entender o sistema

| Caminho | Função |
|---|---|
| `src/lib/data/lancamentos.ts` | Agregador `getRealMonthlyForUnits` — coração do dashboard |
| `src/lib/data/units.ts` | `getUnits`, `networkTotalsFromUnits`, `platformTotalsFromUnits` |
| `src/lib/mock-monthly.ts` | Tipo `UnitMonthly` + `emptyMonthly` (fallback) |
| `src/app/(app)/page.tsx` | Dashboard |
| `src/app/(app)/unidades/[codigo]/lancamentos/_components/monthly-tab.tsx` | Lógica de CMV breakdown |
| `src/app/(app)/unidades/_components/new-unit-dialog.tsx` | Padrão de modal + server action |
| `supabase/migrations/0006_total_recebido_real.sql` | Última migration |

---

## Migrations (rodadas, em ordem)

```
0001_init.sql                    — holdings, brands, units, user_unit_access + RLS helpers
0002_unit_platforms.sql          — M2M unit↔platform
0003_profiles.sql                — profiles + trigger auto-create
0004_lancamentos.sql             — daily_entries + monthly_entries
0005_monthly_platform_entries.sql — taxas/VR/cancelamentos por plataforma/mês
0006_total_recebido_real.sql     — coluna total_recebido_real
```

---

## O que NÃO está implementado

### Permissões / RLS real pro Franqueado 🔐
**Status:** modelo de dados existe (`user_unit_access` + helpers), mas a UI ainda não filtra. Hoje, qualquer logado vê tudo.
**Pra fazer:**
1. Trocar `createAdminClient` por `createClient` nas queries do dashboard e listagens (assim RLS aplica)
2. Validar que `getUnits` devolve só a unidade do franqueado
3. Esconder `/administracao/*` pro perfil Franqueado
4. Esconder ações de criar/editar/deletar unidade pro Franqueado

### Gráficos no Dashboard 📊
Nenhum gráfico ainda. Considerar Recharts. Sugestões:
- Evolução diária do mês (linha)
- Comparativo plataformas (barras)
- Ranking de unidades (barras horizontais)

### Filtro de período no Dashboard 📅
Hoje o dashboard é sempre **mês corrente**. Falta um seletor (mês atual / mês anterior / range customizado).
`getRealMonthlyForUnits` já recebe `year, month` — só falta UI.

### Páginas placeholder (menu lateral aponta pra 404) 🗂
Itens órfãos do menu:
- Alertas
- Plataformas
- Produtos
- Avaliações
- Conexões
- Configurações
- Resultado (rede)

### Integração iFood API 🔌
Não iniciada. Quando começar:
- Documentação iFood Partner: provavelmente OAuth2 + endpoints de orders
- Webhook receiver pra status de pedidos em tempo real
- Mapear cada `daily_entries` pra source `api` vs `manual`

---

## Decisões importantes que JÁ FORAM feitas (não reabrir)

- ✅ Perfis simplificados: **Administrador + Franqueado**. Não tem mais "gestor de marca" ou similar.
- ✅ Código de unidade é **string arbitrária** (não auto-incremento, não padrão fixo)
- ✅ CNPJ é **opcional**
- ✅ VR taxa auto = **8%** (`liquido = bruto * 0.92`)
- ✅ Alerta CMV dispara **só na soma** (Total > 40%), nunca em cards individuais
- ✅ Dashboard NÃO usa mock — `mockMonthlyFor` foi removido dali (mock só sobra como `emptyMonthly` fallback no agregador)
- ✅ Logos das plataformas usam `<img>` direto (next/image gera Content-Disposition: attachment)

---

## Gotchas / armadilhas a lembrar

### Next.js 16
- Versão com breaking changes. Antes de assumir API, ler `node_modules/next/dist/docs/`.

### shadcn v4 (Base UI, NÃO Radix)
- `DialogTrigger` usa `render={<button …/>}`, não children
- `Select.onValueChange` é `(value: string | null) => void` — sempre wrappar:
  ```tsx
  onValueChange={(v) => setSomething(v ?? "default")}
  ```
- `Collapsible` usa `data-open`/`data-closed`, NÃO `data-panel-open`

### Supabase
- **Service role**: nunca com `NEXT_PUBLIC_`, nunca commitada, só `.env.local` + Vercel env
- Sempre `import "server-only"` em módulo que importa `createAdminClient`
- Login do Marcus: marcus@massarenti.me

### Git
- HTTP/2 do GitHub bugado: `git config http.version HTTP/1.1`
- Sempre **novo commit**, nunca `--amend` sem pedir
- Commits em pt-BR, imperativo

---

## Próxima ação

⏸ **Aguardando Marcus escolher próximo passo entre:**
- 🔐 Restrição franqueado (RLS real)
- 📊 Gráficos (Recharts)
- 📅 Filtro de período no Dashboard
- 🗂 Páginas placeholder dos 404
- 🔌 Integração iFood API

Não iniciar nenhum por conta própria — Marcus prefere escolher via opções clicáveis (`AskUserQuestion`).

---

## Como Marcus trabalha (pra calibrar tom)

- Fundador da Cozina Foods, é dev dos próprios sistemas usando Claude Code + Lovable + IA
- Quer ser conduzido **passo a passo**, com perguntas como **opções clicáveis**
- Didático, mas não raso — explica o porquê
- Prefere visual **compacto**: 1 bloco com seletor > 3 cards repetidos
- Logo das plataformas sempre que fizer sentido
- Quando dá feedback, é direto e específico ("o alerta tem que ser a soma", "tira o mapa", "centraliza")
