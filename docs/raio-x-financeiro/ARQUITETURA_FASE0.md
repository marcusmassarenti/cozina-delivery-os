# Raio X Financeiro 2.0 — Documento de Arquitetura (Fase 0)

> **Status:** Fase 0 — arquitetura, sem código. Aprovação necessária antes das migrations da Fase P0.
> **Fonte do domínio:** `docs/MAPEAMENTO_CASCATA_RAIO_X_FINANCEIRO.md` (o `.md`) + conferência na planilha `TM 60 - 100k - CNP (1).xlsx` (senha `ECD@123`, descriptografada só para leitura).
> **Alvo:** módulo `finance` (Raio X) dentro do Cozina Delivery OS (Next.js 16 + Supabase, multi-tenant/RLS).

---

## 0. Sumário e o que foi verificado

Este documento entrega: (a) modelo de dados consolidado, (b) estratégia de cálculo (DAG), (c) integração com as vendas do Delivery OS, (d) plano de implementação em fases, e uma seção final de **DECISÕES PENDENTES**.

**Verificação cruzada `.md` × planilha:**
- A planilha tem **125 abas** e bate com a estrutura do `.md`: `DASHBOARD DE INDICADORES`, `DRE SINTÉTICA` (42×48), `DRE ANALÍTICA` (182×5, plano de contas hierárquico), `MARGEM E MARKUP` (121×46), `CADASTRO DE INSUMOS` (209 linhas), `FICHAS TÉCNICAS` (índice) + `FICHA1…FICHA100`.
- **1 divergência material encontrada e resolvida nesta sessão** (markup — ver §3.3): a planilha NÃO tem "um regime canônico ambíguo"; ela calcula **dois preços por prato, um por canal de venda** (`CANAL PRÓPRIO` × `APLICATIVOS`). Confirmado com o Marcus:
  - **Canais são entidade** (cada canal define quais % entram no divisor do markup).
  - **Um preço por app** (iFood/99/Keeta + próprio, cada um um canal).

**Convenção-chave de adaptação:** onde o `.md` diz `tenant_id references tenants(id)`, o Delivery OS real usa **`holding_id references holdings(id)`** — a holding é o tenant. Todo o schema abaixo já vem adaptado.

---

## 1. Convenções do Delivery OS adotadas (inegociáveis)

Extraídas de `0001_init.sql`, `0048_financeiro_modulo.sql`, `0072_unit_cost_categories.sql`, `CLAUDE.md`:

| Tema | Convenção real do Delivery OS | Aplicação no Raio X |
|---|---|---|
| **Tenant** | `holdings` (rede/cliente) → `brands` → `units` (lojas). Acesso via `user_unit_access`. | Tenant = `holding_id`. Tabelas de operação também levam `unit_id` (ver §DECISÕES). |
| **RLS** | `enable row level security` + policy de **SELECT** usando os helpers `has_holding_access(uuid)` / `has_brand_access(uuid)` / `has_unit_access(uuid)` (SECURITY DEFINER, `search_path=public`). | Toda tabela nova: RLS on + SELECT com o helper do seu escopo. |
| **Escrita** | INSERT/UPDATE/DELETE **não** têm policy — são feitos pelo **service_role** (server action / admin client), com o escopo aplicado na camada de app (`getAccessibleUnitIds`). | Idem — escrita via server action com guard de módulo. |
| **UUID** | `uuid_generate_v4()` (extensão `uuid-ossp`). | Usar `uuid_generate_v4()` (não `gen_random_uuid()` do `.md`). |
| **Timestamps** | `created_at timestamptz not null default now()`; `updated_at` com trigger `touch_updated_at`. | Idem. |
| **Numéricos** | `numeric(14,2)` para dinheiro; percentuais como fração. | Custos `numeric(12,4)`; dinheiro `numeric(14,2)`; percentuais `numeric(6,5)`. |
| **Competência** | Módulos financeiros usam `ref_year`/`ref_month` (fin_entries) ou `ano`/`mes` (unit_cost_values). | Padronizar `competencia date` (dia 1 do mês) — mais limpo para funções de DRE. |
| **Prefixo** | `fin_*` = módulo caixa (já existe). | Novo módulo usa prefixo **`rx_`** (Raio X) para não colidir com `fin_*`. |

---

## 2. Reconciliação com o que JÁ existe (reutilizar > recriar)

O Delivery OS já tem infra financeira. Antes de criar tabela nova, o que reaproveitar:

| Já existe | O que é | Decisão no Raio X |
|---|---|---|
| `producao_insumo`, `producao_prato`, `producao_prato_nome`, `producao_ficha` (`0038`) | Ficha técnica **GLOBAL** (sem tenant), keyed por código CNP, foco em **demanda** (prato→insumo×qtd) para o ERP industrial. **Não tem custo.** | **Manter separado.** É single-tenant e de demanda. O Raio X cria `rx_insumos`/`rx_fichas` (multi-tenant, com custo). **Ponte opcional** (só p/ Cozina): `rx_insumos.producao_insumo_codigo` → liga ao CNP para o CMV real reusar o mix de `producao_ficha`. |
| `unit_cost_categories` + `unit_cost_values` (`0072`) | Custos por **unidade**, por **mês**, tipo `cmv`/`operacao`. A soma alimenta `monthly_entries` → DRE atual (`DreDetalhado`). | É o **embrião** do plano de contas, mas raso (2 tipos). O Raio X **generaliza** isso num `rx_plano_contas` hierárquico + `rx_lancamentos`. Ver DECISÃO sobre migração/coexistência. |
| `fin_accounts`, `fin_categories`, `fin_entries` (`0048`) | **Fluxo de caixa** (contas a pagar/receber, conciliação), holding-scoped, `ref_year/ref_month`. | Concern diferente (**caixa** = regime de caixa; **DRE** = competência). Manter. `rx_lancamentos` pode, no futuro, **derivar** de `fin_entries` (opcional), mas não são a mesma tabela. |
| `monthly_entries`, `daily_entries`, `ifood/ninefood/keeta_pedidos`, `unit_produtos_vendidos`, `unit_produto_precos` | Vendas e faturamento reais por loja/plataforma/produto. | **Fonte da integração** (§5): faturamento, nº pedidos (ticket médio), mix de produtos (CMV real), taxas por canal. |
| Helpers `has_*_access`, `getAccessibleUnitIds`, guard de módulo (RBAC `app_roles`/`role_module_perms`) | Isolamento e permissão. | Reusar 100%. Registrar um módulo `finance`/`raio-x` no RBAC. |

---

## 3. (a) Modelo de dados consolidado

Namespace `rx_`. Todas com RLS on + SELECT via helper de escopo; escrita via service_role.

### 3.1 Camada [1] — Insumos (`rx_insumos`)

```sql
create table public.rx_insumos (
  id             uuid primary key default uuid_generate_v4(),
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  nome           text not null,
  valor_pago     numeric(12,4) not null,
  volume         numeric(12,4) not null default 1,
  unidade        text not null,                 -- 'UN' | 'KG' | 'L' ...
  fator_correcao numeric(8,4)  not null default 1,
  -- valor unitário ajustado (base da cascata). Coluna gerada = integridade no banco.
  valor_final    numeric(12,4) generated always as
                   ((valor_pago * fator_correcao) / nullif(volume,0)) stored,
  -- ponte opcional p/ o ERP da Cozina (CMV real via producao_ficha):
  producao_insumo_codigo text references public.producao_insumo(codigo),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index rx_insumos_holding_idx on public.rx_insumos (holding_id);
alter table public.rx_insumos enable row level security;
create policy rx_insumos_sel on public.rx_insumos for select using (public.has_holding_access(holding_id));
```
> `valor_final` como **coluna gerada** replica `H = (VALOR_PAGO * FATOR)/VOLUME` com `nullif(volume,0)` no lugar do `IFERROR`.

### 3.2 Camada [2] — Fichas técnicas (`rx_fichas`, `rx_ficha_ingredientes` + view de custo)

```sql
create table public.rx_fichas (
  id           uuid primary key default uuid_generate_v4(),
  holding_id   uuid not null references public.holdings(id) on delete cascade,
  nome         text not null,                    -- "PRATO INDIVIDUAL - PULLED PORK"
  tipo         text,                             -- 'individual' | 'combo' ...
  modo_preparo text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.rx_ficha_ingredientes (
  id                 uuid primary key default uuid_generate_v4(),
  holding_id         uuid not null references public.holdings(id) on delete cascade,
  ficha_id           uuid not null references public.rx_fichas(id) on delete cascade,
  insumo_id          uuid not null references public.rx_insumos(id) on delete restrict,  -- FK real (não "match por nome")
  quantidade_liquida numeric(12,4) not null,
  ordem              int default 0
);

-- Custo da ficha como VIEW: recalcula sozinho quando o insumo muda de preço.
create view public.v_rx_ficha_custo as
  select fi.ficha_id, fi.holding_id,
         sum(fi.quantidade_liquida * i.valor_final) as custo_total
  from public.rx_ficha_ingredientes fi
  join public.rx_insumos i on i.id = fi.insumo_id
  group by fi.ficha_id, fi.holding_id;
```
> Vínculo insumo↔ficha vira **FK** (`insumo_id`), matando o "match por nome" frágil da planilha. Custo é **view** (não coluna estática) — é isso que dá o "raio X" (propagação insumo→ficha).

### 3.3 Camada [3] — Precificação por CANAL (o núcleo, corrigido vs `.md`)

**Correção sobre o `.md`:** a planilha calcula preço **por canal de venda**, e cada canal usa um **subconjunto diferente de deduções** no divisor do markup. Confirmado na planilha (`MARGEM E MARKUP`):

```
Canal PRÓPRIO   (W): markup = 1 / (1 − F−G−I−J−K−L…U − margem)   ← inclui K (app próprio), OMITE H (apps)
Canal APPS/iFood(AF): markup = 1 / (1 − F−G−H−I−J−L…U − margem)   ← inclui H (apps),        OMITE K (app próprio)
preço_canal = custo_direto_ficha × markup_canal
```

Modelagem (canais como entidade + quais componentes entram no divisor por canal):

```sql
-- Catálogo de componentes de custo variável (as colunas F..U da planilha).
-- Fica no TEMPLATE de metodologia (IP do Bruno, versionável). Ex.: taxa_cartao,
-- royalties, apps, app_proprio, impostos, adm, marketing, ... (mapeiam ao plano de contas).
create table public.rx_componentes_custo (
  id          uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.rx_metodologia_templates(id),
  chave       text not null,        -- 'apps', 'app_proprio', 'taxa_cartao' ...
  rotulo      text not null,
  conta_codigo text,                -- liga ao plano_contas (a % vem da DRE Sintética)
  unique (template_id, chave)
);

-- Canais de venda por holding (próprio, ifood, 99food, keeta...).
create table public.rx_canais (
  id          uuid primary key default uuid_generate_v4(),
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  chave       text not null,        -- 'proprio' | 'ifood' | '99food' | 'keeta'
  rotulo      text not null,
  ativo       boolean not null default true,
  unique (holding_id, chave)
);

-- Quais componentes entram no divisor do markup DAQUELE canal
-- (ex.: 'proprio' inclui app_proprio e exclui apps; 'ifood' o contrário).
create table public.rx_canal_componentes (
  canal_id     uuid not null references public.rx_canais(id) on delete cascade,
  componente_id uuid not null references public.rx_componentes_custo(id),
  -- override opcional da % do canal (ex.: comissão iFood ≠ 99); se null, usa a % da DRE.
  pct_override numeric(6,5),
  primary key (canal_id, componente_id)
);

-- Estrutura de % variável do negócio (as % que vêm da DRE Sintética), por holding.
-- Fonte primária: derivada dos lançamentos (§4). Esta tabela é cache/override manual.
create table public.rx_config_precificacao (
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  componente_id uuid not null references public.rx_componentes_custo(id),
  pct         numeric(6,5) not null default 0,
  primary key (holding_id, componente_id)
);

-- Precificação por ficha: margem desejada é o único input livre. Preço por canal
-- é DERIVADO (função). preco_manual permite override por (ficha, canal).
create table public.rx_precificacao_ficha (
  id              uuid primary key default uuid_generate_v4(),
  holding_id      uuid not null references public.holdings(id) on delete cascade,
  ficha_id        uuid not null references public.rx_fichas(id) on delete cascade,
  margem_desejada numeric(6,5) not null default 0,
  unique (holding_id, ficha_id)
);
create table public.rx_precificacao_override (
  ficha_id    uuid not null references public.rx_fichas(id) on delete cascade,
  canal_id    uuid not null references public.rx_canais(id) on delete cascade,
  preco_manual numeric(12,2),
  primary key (ficha_id, canal_id)
);
```

Markup, preço por canal e %CMV → **função de aplicação/Postgres**, nunca campo editável:
```
markup(canal)  = 1 / (1 − Σ(% dos componentes do canal) − margem_desejada)
preco(canal)   = custo_direto(ficha) × markup(canal)
pct_cmv(canal) = custo_direto / preco(canal)
```
> **Guarda de negócio (P0):** se `Σ% + margem_desejada ≥ 1`, o divisor ≤ 0 → o markup "explode". Retornar **erro de negócio** ("estrutura de custo inviável para essa margem nesse canal"), nunca propagar `#DIV/0`.

### 3.4 Camada [4] — Plano de contas + lançamentos (metodologia versionável)

```sql
-- Template da metodologia (IP do Bruno) — habilita white-label.
create table public.rx_metodologia_templates (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,        -- "ECD Finance"
  versao    text not null,        -- "1.0"
  publicado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Plano de contas hierárquico (pertence a um template).
create table public.rx_plano_contas (
  id           uuid primary key default uuid_generate_v4(),
  template_id  uuid not null references public.rx_metodologia_templates(id) on delete cascade,
  codigo       text not null,     -- '2.5.1'
  nome         text not null,     -- 'Entregadores / motoboys'
  parent_id    uuid references public.rx_plano_contas(id),
  tipo         text not null,     -- 'entrada'|'deducao'|'custo'|'despesa_fixa'|'despesa_variavel'|'resultado'
  natureza     text,              -- 'variavel'|'fixo' (alimenta o ponto de equilíbrio)
  eh_calculado boolean not null default false,  -- Fat. Líquido, Lucro Bruto, Resultados = derivados
  ordem        int not null default 0,
  unique (template_id, codigo)
);

-- Lançamentos reais por holding + (unit opcional) + competência.
create table public.rx_lancamentos (
  id          uuid primary key default uuid_generate_v4(),
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  unit_id     uuid references public.units(id) on delete set null,   -- DRE por loja (ver DECISÃO)
  conta_id    uuid not null references public.rx_plano_contas(id),
  competencia date not null,      -- dia 1 do mês de referência
  valor       numeric(14,2) not null,
  descricao   text,
  origem      text not null default 'manual',  -- 'manual'|'venda_delivery_os'|'importacao'
  created_at  timestamptz not null default now()
);
create index rx_lancamentos_lookup on public.rx_lancamentos (holding_id, competencia);
```
> `eh_calculado=true` bloqueia lançamento direto em linhas de resultado. `natureza` (fixo/variável) alimenta o ponto de equilíbrio. Semáforos, plano de contas e componentes de markup vivem no **template** — nunca hardcoded.

### 3.5 Camada [5] — DRE Sintética (funções, não tabela)

Derivada de `rx_lancamentos` + `rx_plano_contas`. **A verdade financeira vive no banco** (agrega lançamentos), parametrizada por `(holding_id, unit_id?, competencia)`:

```sql
create or replace function public.rx_dre_sintetica(p_holding uuid, p_unit uuid, p_competencia date)
returns table(linha text, codigo text, valor numeric, av numeric)  -- av = valor / faturamento bruto
language sql stable security definer set search_path=public as $$ ... $$;

create or replace function public.rx_ponto_equilibrio(p_holding uuid, p_unit uuid, p_competencia date)
returns numeric ...  -- custo_fixo / margem_contribuição% ; MC% = 100% − (%deduções_variáveis + %CMV)
```
Regras transcritas da planilha (`DRE SINTÉTICA`): `Fat. Líquido = Bruto − Σdeduções`; `Lucro Bruto = Fat.Líq − CMV`; `Result. Operacional = Lucro Bruto − Σdesp.fixas`; `Result. Líquido = Op − empréstimos − investimentos`; `Ponto Equilíbrio = Custo Fixo ÷ MC%`.

### 3.6 Camada [6] — Dashboard (KPIs derivados + semáforos do template)

Nada é armazenado como KPI editável. Tudo deriva das camadas anteriores:

| KPI | Fórmula |
|---|---|
| Ticket Médio | faturamento ÷ nº pedidos |
| CMV % | CMV ÷ faturamento |
| Margem de Contribuição % | 100% − custo variável total |
| Markup Médio | faturamento bruto ÷ CMV |
| Lucro Líquido R$ / % | resultado líquido (R$ e ÷ faturamento) |
| Ponto de Equilíbrio R$ | custo fixo ÷ MC% |
| Prime Cost % | (CMV + Pessoal + Sócios) ÷ faturamento |

**Semáforos** (thresholds da planilha) vivem em `rx_metodologia_templates` (ex.: tabela `rx_semaforo_regras(template_id, kpi, faixa_verde, faixa_vermelha)`), não no código:
`CMV ≤35% excelente / ≥40% muito alto`; `Lucro Líq. ≥16% excelente / ≤10% ruim`; `Prime Cost ≤50% excelente / >60% ruim`.

---

## 4. (b) Estratégia de cálculo — DAG (sem acoplamento circular)

A planilha tem leitura circular (MARGEM lê SINTÉTICA que lê ANALÍTICA). No sistema vira **ordem determinística**:

```
rx_insumos.valor_final        → coluna gerada (banco)
v_rx_ficha_custo              → VIEW (banco) — custo direto por ficha
rx_lancamentos               → dado de entrada (manual/importado/vendas)
rx_dre_sintetica()           → FUNÇÃO — agrega lançamentos; produz as % (deduções, CMV, fixas)
rx_config_precificacao       → cache das % (saída da DRE) usadas na precificação
markup/preço por canal        → FUNÇÃO — usa custo_direto + % do canal + margem
dashboard KPIs + semáforos    → FUNÇÃO/aplicação — lê tudo acima
```

**Onde cada coisa é computada e por quê:**
- **Coluna gerada** (`valor_final`): base imutável da cascata — integridade no banco.
- **View** (`v_rx_ficha_custo`): custo da ficha propaga automático quando insumo muda.
- **Função Postgres** (DRE, ponto de equilíbrio, markup): agregação multi-tenant, auditável, uma verdade só; roda com o dado, não na app.
- **Camada de app**: orquestra chamadas, aplica escopo (`getAccessibleUnitIds`), formata, e trata os **erros de negócio** (divisor do markup).

> Quebra do ciclo: a % que a precificação usa **não** "lê a aba MARGEM" — ela vem da saída de `rx_dre_sintetica()` (que só depende de lançamentos). Precificação é a **última** etapa, nunca entrada de si mesma.

---

## 5. (c) Integração com as vendas do Delivery OS

O diferencial: as vendas reais **alimentam a DRE sozinhas** e transformam o CMV de arbitrado em **medido**.

| Dado do Delivery OS | Vira | Como |
|---|---|---|
| Faturamento real (monthly/daily/pedidos) | `rx_lancamentos` conta `1` (Fat. Bruto), `origem='venda_delivery_os'` | job de agregação por `(unit, competencia)` |
| Nº de pedidos | Ticket Médio | faturamento ÷ pedidos |
| Mix de produtos vendidos (`unit_produtos_vendidos`) × `rx_fichas` | **CMV real** | Σ(qtd vendida × custo_direto da ficha) — fecha o loop insumo→ficha→venda |
| Taxas por meio de pagamento / canal | contas `2.1/2.4` + `pct_override` do canal | mapear PIX/cartão/iFood/99/Keeta às deduções e às comissões por-app |

> **CMV medido** exige o de-para produto-vendido ↔ ficha. Para a Cozina, reaproveitar a ponte `rx_insumos.producao_insumo_codigo` + `producao_ficha`/`producao_prato_nome` (que já resolve nome-de-plataforma → prato). Para um tenant novo (white-label), é um cadastro de de-para próprio.

---

## 6. (d) Plano de implementação

| Fase | Escopo | Entregável |
|---|---|---|
| **P0 — Fundação** | `rx_insumos`, `rx_fichas`, `rx_ficha_ingredientes` + `v_rx_ficha_custo` + RLS + módulo no RBAC. | Cadastro de insumo/ficha com **custo propagando** (muda insumo → muda ficha). |
| **MVP-1 — Precificação** | `rx_metodologia_templates` (seed ECD), `rx_componentes_custo`, `rx_canais`, `rx_canal_componentes`, `rx_config_precificacao`, `rx_precificacao_ficha` + funções markup/preço **por canal** + guarda do divisor. | Tela "Margem & Markup": **preço por canal** (próprio/iFood/99/Keeta) + simulador de desconto e de "quantidade p/ manter lucro". |
| **MVP-2 — DRE** | `rx_plano_contas`, `rx_lancamentos`, `rx_dre_sintetica()`, `rx_ponto_equilibrio()`, `rx_semaforo_regras`. | DRE Analítica + Sintética mensal por loja + **dashboard dos 7 KPIs com semáforos**. |
| **Integração — Vendas** | job vendas → `rx_lancamentos`; CMV real por mix × ficha; taxas/comissões por canal. | **DRE que se atualiza sozinha** a partir das vendas; CMV medido. |
| **Escala — White-label** | metodologia publicável/versionada; templates por cliente; assinatura conjunta. | Bruno licencia a metodologia; novos tenants instanciam o template. |

---

## 7. Guardas de negócio (checklist P0)

1. **Isolamento multi-tenant (P0/LGPD):** toda tabela `holding_id` + RLS + helper. Nenhuma função cruza holdings.
2. **Divisor do markup:** `Σ% + margem ≥ 1` → erro de negócio, nunca `#DIV/0`.
3. **Contas calculadas** (`eh_calculado`): Fat. Líquido, Lucro Bruto, Resultados — bloquear lançamento direto.
4. **Metodologia = template versionado:** plano de contas, semáforos, componentes de markup — fora do código.
5. **Competência** `date` (dia 1) como chave temporal em todo lançamento e função.
6. **FK real** insumo↔ficha (não match por nome); prever reconciliação na importação histórica.
7. **Propagação preservada:** insumo → ficha (view) → preço (função) → CMV → DRE — cadeia sem cache que "esfrie".

---

## 8. DECISÕES PENDENTES (preciso confirmar antes da Fase P0)

Já resolvidas nesta sessão: ✅ **markup por canal (entidade)**; ✅ **um preço por app**.

Ainda em aberto:

1. **Escopo da DRE/lançamentos: por loja (`unit_id`) ou por holding?**
   *Recomendo por `unit_id`* (com `holding_id` p/ isolamento), espelhando a DRE por-loja que o Delivery OS já tem (`unit_cost_*` + `DreDetalhado`), consolidando no holding via agregação. Confirmar.

2. **Escopo de insumos/fichas/precificação: holding, brand ou unit?**
   *Recomendo holding* (catálogo compartilhado pela rede), com override de preço/custo por loja só se necessário depois. Confirmar (receitas iguais entre lojas da mesma marca?).

3. **Plano de contas inicial: espelhar 1:1 a DRE Analítica da planilha, ou já generalizar?**
   *Recomendo espelhar 1:1 no seed do template "ECD Finance v1.0"* (fidelidade à metodologia do Bruno) e deixar a generalização para o white-label (novos templates). Confirmar — **é decisão do Bruno** (é o IP dele).

4. **Coexistência com `unit_cost_categories/values` (o DRE atual):** o Raio X substitui, complementa ou migra esse modelo? *Recomendo:* Raio X é a evolução; na Integração, migrar os valores de `unit_cost_values` para `rx_lancamentos` e aposentar o modelo raso — mas só depois do MVP-2 estável. Confirmar timing.

5. **Fonte das % por componente:** as % (taxas, comissões, deduções) vêm **da DRE** (derivadas de lançamentos) ou são **input manual** de configuração inicial? A planilha lê da DRE Sintética; mas um tenant novo sem histórico precisa de um input inicial. *Recomendo:* `rx_config_precificacao` como override/seed manual, sobrescrito pela DRE quando houver lançamentos. Confirmar.

6. **Comissão por-app:** as % de iFood/99/Keeta vêm do que o Delivery OS já mede (taxas reais por plataforma) ou de config manual? *Recomendo:* usar as taxas reais medidas quando existirem (via `pct_override` do canal), com fallback manual. Confirmar.

---

*Quando estas decisões forem confirmadas, parto para as migrations da Fase P0 (tabelas de fundação + RLS + views de custo).*
