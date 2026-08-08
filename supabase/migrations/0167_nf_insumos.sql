-- NF de entrada → catálogo de insumos → custo real do insumo.
--
-- Passos 1 a 4 do módulo de CMV. Os passos 5 e 6 (ficha técnica ligando
-- produto vendido aos insumos, e o CMV com as taxas das plataformas) vêm
-- depois -- mas 1 a 4 já valem sozinhos: custo de insumo atualizado a cada
-- nota, que hoje ninguém tem.
--
-- Validado contra a NFe 2128 (CD Comercio de Alimentos → Churrasco no Pote
-- Brooklin, 07/08/2026, R$ 18.895,86, 22 itens).

-- ── Regime fiscal da loja ───────────────────────────────────────────────────
-- Decide se o imposto da nota é custo ou crédito, e a diferença é grande:
-- naquela nota o ICMS sozinho é R$ 2.884,10 (15,3% do total), com alíquotas
-- de 7%, 12% e 18% CONVIVENDO na mesma nota -- por isso o cálculo é item a
-- item, nunca um percentual médio.
--
-- Fica por UNIDADE e não por holding porque no SaaS cada cliente tem o seu, e
-- dentro de uma rede uma loja pode ter estourado o teto do Simples enquanto
-- as outras não.
--
-- Default 'simples': é o caso comum em franquia de delivery, e errar para o
-- Simples superestima o custo -- que é o lado seguro de errar num CMV.
alter table public.units
  add column if not exists regime_fiscal text not null default 'simples'
  check (regime_fiscal in ('simples', 'normal'));

comment on column public.units.regime_fiscal is
  'simples = imposto da NF é custo. normal = ICMS/PIS/COFINS viram crédito e saem do custo.';

-- ── Catálogo de insumos ─────────────────────────────────────────────────────
create table if not exists public.insumos (
  id             uuid primary key default gen_random_uuid(),
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  -- `cProd` da nota (CNP083, EC03025…). É o código do fornecedor e se repete
  -- igual em toda nota, então é ele que junta a compra de agosto com a de
  -- setembro no mesmo insumo.
  codigo         text not null,
  nome           text not null,
  ncm            text,

  -- A unidade que vem na nota (un, cx, kg, pct).
  unidade_compra text not null,

  -- A unidade em que a ficha técnica vai consumir (g, ml, un).
  unidade_uso    text,
  -- Quantas `unidade_uso` cabem em 1 `unidade_compra`.
  --
  -- É ISTO que impede o CMV de errar por ordem de grandeza: "POTE SELADO CAIXA
  -- C/ 480UN" entra na nota como 1 `cx` a R$ 614,40, e o que a ficha precisa é
  -- R$ 1,28 por pote. Nasce null de propósito -- sem alguém dizer o fator, o
  -- sistema não tem como adivinhar, e chutar 1 seria pior que admitir que não
  -- sabe.
  fator_conversao numeric(14,4),

  -- Custo por `unidade_uso`, recalculado a cada nota nova. Null enquanto
  -- faltar o fator.
  custo_atual     numeric(14,6),
  custo_em        timestamptz,
  -- Custo por `unidade_compra` — esse existe assim que a primeira nota entra,
  -- independente de fator. Serve pra tela mostrar algo útil desde o dia 1.
  custo_compra    numeric(14,6),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Um insumo por código, por cliente.
create unique index if not exists insumos_holding_codigo_idx
  on public.insumos (holding_id, codigo);

-- ── Notas fiscais de entrada ────────────────────────────────────────────────
create table if not exists public.nf_documentos (
  id             uuid primary key default gen_random_uuid(),
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  -- A loja destinatária. Null = nota importada antes de sabermos de quem é.
  unit_id        uuid references public.units(id) on delete set null,

  -- Chave de acesso (44 dígitos). Única no sistema inteiro, não por holding:
  -- uma NF-e é única no Brasil, e a mesma nota chegando por dois caminhos é
  -- reimportação, não dado novo.
  chave          text not null,
  numero         text,
  serie          text,
  emissao        date,

  emit_cnpj      text,
  emit_nome      text,
  dest_cnpj      text,
  dest_nome      text,

  valor_total    numeric(14,2),
  valor_produtos numeric(14,2),
  valor_desconto numeric(14,2) default 0,
  valor_frete    numeric(14,2) default 0,
  valor_icms     numeric(14,2) default 0,
  valor_pis      numeric(14,2) default 0,
  valor_cofins   numeric(14,2) default 0,
  valor_ipi      numeric(14,2) default 0,
  valor_st       numeric(14,2) default 0,

  -- XML original. Nota fiscal é documento: se amanhã a gente descobrir que
  -- leu um campo errado, dá pra reprocessar sem pedir o arquivo de volta.
  xml            text,

  importado_por  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create unique index if not exists nf_documentos_chave_idx
  on public.nf_documentos (chave);
create index if not exists nf_documentos_holding_emissao_idx
  on public.nf_documentos (holding_id, emissao desc);
create index if not exists nf_documentos_unit_idx
  on public.nf_documentos (unit_id);

create table if not exists public.nf_itens (
  id             uuid primary key default gen_random_uuid(),
  nf_id          uuid not null references public.nf_documentos(id) on delete cascade,
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  insumo_id      uuid references public.insumos(id) on delete set null,

  n_item         int not null,
  codigo         text,
  descricao      text,
  ncm            text,
  cfop           text,

  unidade        text,
  quantidade     numeric(14,4),
  valor_unitario numeric(14,6),
  valor_total    numeric(14,2),

  -- Guardados item a item porque a alíquota varia DENTRO da mesma nota.
  v_icms         numeric(14,2) default 0,
  v_pis          numeric(14,2) default 0,
  v_cofins       numeric(14,2) default 0,
  v_ipi          numeric(14,2) default 0,

  created_at     timestamptz not null default now()
);

create index if not exists nf_itens_nf_idx on public.nf_itens (nf_id);
create index if not exists nf_itens_insumo_idx on public.nf_itens (insumo_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo padrão do módulo financeiro (0048): leitura pela holding, escrita só
-- pelo servidor com service_role.
alter table public.insumos enable row level security;
alter table public.nf_documentos enable row level security;
alter table public.nf_itens enable row level security;

create policy "insumos_select" on public.insumos for select
  using (public.has_holding_access(holding_id));
create policy "nf_documentos_select" on public.nf_documentos for select
  using (public.has_holding_access(holding_id));
create policy "nf_itens_select" on public.nf_itens for select
  using (public.has_holding_access(holding_id));

comment on table public.insumos is
  'Catálogo de insumos alimentado pelo cProd das NFs. fator_conversao traduz unidade de compra em unidade de ficha técnica.';
comment on table public.nf_documentos is
  'NF-e de entrada (compra do CD). chave é única no sistema — reimportar a mesma nota não duplica.';
comment on table public.nf_itens is
  'Itens da NF. Impostos por item porque a alíquota varia dentro da mesma nota (7%, 12% e 18% convivem).';
