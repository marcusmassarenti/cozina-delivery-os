--------------------------------------------------------------------
-- 0007_platform_imports.sql
-- Importação de relatórios XLSX das plataformas (iFood/99/Keeta).
--
-- 1) Adiciona external_store_id em unit_platforms — mapeia a loja na
--    plataforma (ex.: iFood "260777") com a unidade da nossa base.
-- 2) platform_imports: log de cada importação (auditoria + idempotência).
-- 3) Tabelas específicas do iFood:
--    - Cardápio (diário):    ifood_daily_funnel, ifood_daily_items,
--                             ifood_daily_complementos
--    - Financeiro (mensal):  ifood_financeiro_lancamentos
--      (linha por linha do "Relatório de Conciliação" — granularidade
--       máxima, agregamos depois pra mostrar no Mensal)
--------------------------------------------------------------------

--- 1) Mapeamento de loja externa -----------------------------------

alter table public.unit_platforms
  add column external_store_id text;

create index unit_platforms_external_idx
  on public.unit_platforms (platform, external_store_id)
  where external_store_id is not null;

comment on column public.unit_platforms.external_store_id is
  'ID da loja na plataforma (ex.: iFood 260777). Usado pra match na importação.';


--- 2) Log de importações ------------------------------------------

create table public.platform_imports (
  id              uuid primary key default uuid_generate_v4(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  platform        text not null check (platform in ('ifood', '99food', 'keeta')),
  report_type     text not null,
    -- 'cardapio' | 'financeiro' | 'vendas' | 'cancelamentos' | ...
  cadencia        text not null check (cadencia in ('diario', 'mensal')),
  ref_date        date,             -- preenchido se diário
  ref_year        integer,          -- preenchido se mensal
  ref_month       integer check (ref_month is null or (ref_month >= 1 and ref_month <= 12)),
  source_filename text,
  rows_imported   integer not null default 0,
  status          text not null default 'success'
                  check (status in ('success', 'error', 'partial')),
  error_message   text,
  imported_by     uuid references auth.users(id) on delete set null,
  imported_at     timestamptz not null default now()
);

create index platform_imports_unit_idx
  on public.platform_imports (unit_id, platform, report_type, ref_date);

create index platform_imports_mensal_idx
  on public.platform_imports (unit_id, platform, report_type, ref_year, ref_month);

alter table public.platform_imports enable row level security;

create policy "platform_imports_select_with_access"
  on public.platform_imports for select
  using (public.has_unit_access(unit_id));


--- 3) iFood — Cardápio diário: Funil Loja -------------------------

create table public.ifood_daily_funnel (
  unit_id                 uuid not null references public.units(id) on delete cascade,
  date                    date not null,
  -- Período atual
  visitas                 integer not null default 0,
  visualizacoes           integer not null default 0,
  sacola                  integer not null default 0,
  revisao                 integer not null default 0,
  concluidos              integer not null default 0,
  conversao_pct           numeric(6, 3),
  -- Período anterior (mesmo intervalo, semana anterior)
  visitas_anterior        integer,
  visualizacoes_anterior  integer,
  sacola_anterior         integer,
  revisao_anterior        integer,
  concluidos_anterior     integer,
  conversao_pct_anterior  numeric(6, 3),
  -- Audit
  import_id               uuid references public.platform_imports(id) on delete set null,
  imported_at             timestamptz not null default now(),
  primary key (unit_id, date)
);

alter table public.ifood_daily_funnel enable row level security;

create policy "ifood_daily_funnel_select_with_access"
  on public.ifood_daily_funnel for select
  using (public.has_unit_access(unit_id));


--- 4) iFood — Cardápio diário: Itens ------------------------------

create table public.ifood_daily_items (
  id                    uuid primary key default uuid_generate_v4(),
  unit_id               uuid not null references public.units(id) on delete cascade,
  date                  date not null,
  categoria             text,
  nome_item             text not null,
  visitas               integer not null default 0,
  pedidos               integer not null default 0,
  conversao_pct         numeric(6, 3),
  qtd_vendida           integer not null default 0,
  qtd_com_promocao      integer not null default 0,
  pedidos_com_promocao  integer not null default 0,
  valor_total           numeric(12, 2) not null default 0,
  import_id             uuid references public.platform_imports(id) on delete set null,
  imported_at           timestamptz not null default now(),
  unique (unit_id, date, nome_item)
);

create index ifood_daily_items_unit_date_idx
  on public.ifood_daily_items (unit_id, date);

alter table public.ifood_daily_items enable row level security;

create policy "ifood_daily_items_select_with_access"
  on public.ifood_daily_items for select
  using (public.has_unit_access(unit_id));


--- 5) iFood — Cardápio diário: Complementos -----------------------

create table public.ifood_daily_complementos (
  id                uuid primary key default uuid_generate_v4(),
  unit_id           uuid not null references public.units(id) on delete cascade,
  date              date not null,
  classificacao     text,                -- 'Obrigatório' | 'Opcional'
  nome_complemento  text not null,
  lojas             integer,
  pedidos           integer not null default 0,
  qtd_vendida       integer not null default 0,
  valor_total       numeric(12, 2) not null default 0,
  import_id         uuid references public.platform_imports(id) on delete set null,
  imported_at       timestamptz not null default now(),
  unique (unit_id, date, nome_complemento)
);

create index ifood_daily_complementos_unit_date_idx
  on public.ifood_daily_complementos (unit_id, date);

alter table public.ifood_daily_complementos enable row level security;

create policy "ifood_daily_complementos_select_with_access"
  on public.ifood_daily_complementos for select
  using (public.has_unit_access(unit_id));


--- 6) iFood — Financeiro: Relatório de Conciliação ----------------
-- Granularidade máxima: 1 linha = 1 lançamento financeiro.
-- Cada pedido gera várias linhas (Comissão, Taxa entrega, Promoção,
-- Subsídio, etc.). Agregamos depois no front via SUM.

create table public.ifood_financeiro_lancamentos (
  id                            uuid primary key default uuid_generate_v4(),
  unit_id                       uuid not null references public.units(id) on delete cascade,

  -- Período (vem da coluna "competencia" — sempre confiar nela, NÃO na data_fato_gerador)
  competencia                   text not null,         -- '2026-05'
  ref_year                      integer not null,
  ref_month                     integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Classificação do lançamento
  data_fato_gerador             timestamptz,
  fato_gerador                  text,                  -- 'Venda', 'Cancelamento Total', etc.
  tipo_lancamento               text,                  -- 'Subsidio', 'Cobrança', 'Entrada Financeira', etc.
  descricao_lancamento          text,                  -- 'Comissão do iFood', 'Taxa de entrega iFood', etc.

  -- Valores
  valor                         numeric(14, 4) not null,
  base_calculo                  numeric(14, 4),
  percentual_taxa               numeric(8, 3),
  valor_transacao               numeric(14, 4),
  valor_cesta_inicial           numeric(14, 4),
  valor_cesta_final             numeric(14, 4),

  -- Identificadores do pedido
  pedido_associado_ifood        text,
  pedido_associado_ifood_curto  text,
  pedido_associado_externo      text,

  -- Cancelamento/ocorrência
  motivo_cancelamento           text,
  descricao_ocorrencia          text,

  -- Datas
  data_criacao_pedido           timestamptz,
  data_repasse_esperada         date,
  data_faturamento              timestamptz,
  data_apuracao_inicio          date,
  data_apuracao_fim             date,

  -- Categorização
  responsavel_transacao         text,                  -- 'LOJA' | 'IFOOD'
  canal_vendas                  text,
  impacto_no_repasse            boolean,
  parcela_pagamento             text,
  id_saldo                      text,

  -- Audit
  import_id                     uuid references public.platform_imports(id) on delete set null,
  imported_at                   timestamptz not null default now()
);

create index ifood_fin_lanc_unit_periodo_idx
  on public.ifood_financeiro_lancamentos (unit_id, ref_year, ref_month);

create index ifood_fin_lanc_pedido_idx
  on public.ifood_financeiro_lancamentos (unit_id, pedido_associado_ifood);

create index ifood_fin_lanc_data_idx
  on public.ifood_financeiro_lancamentos (unit_id, data_fato_gerador);

alter table public.ifood_financeiro_lancamentos enable row level security;

create policy "ifood_fin_lanc_select_with_access"
  on public.ifood_financeiro_lancamentos for select
  using (public.has_unit_access(unit_id));
