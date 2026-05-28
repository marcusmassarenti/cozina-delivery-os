--------------------------------------------------------------------
-- 0010_ifood_cardapio_periodo.sql
-- Snapshot agregado de Cardápio de período > 1 dia (ex.: 28/04 → 27/05).
--
-- Diferente do ifood_daily_funnel (1 linha/dia/loja), aqui guardamos
-- 1 linha por (unidade, period_start, period_end). Funil Loja do XLSX
-- traz todas as 10 lojas da rede num único arquivo — multi-loja.
--
-- Não conflita com daily_funnel: queries do diário ignoram esta tabela,
-- queries de "snapshot do período" leem só daqui.
--------------------------------------------------------------------

create table public.ifood_cardapio_periodo (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  -- Período coberto
  period_start             date not null,
  period_end               date not null,
  period_label             text not null,  -- "28/04/2026 - 27/05/2026" (raw do XLSX)

  -- Funil agregado do período
  visitas                  integer not null default 0,
  visualizacoes            integer not null default 0,
  sacola                   integer not null default 0,
  revisao                  integer not null default 0,
  concluidos               integer not null default 0,
  conversao_pct            numeric(6, 3),

  -- Período anterior (comparativo do iFood)
  visitas_anterior         integer,
  visualizacoes_anterior   integer,
  sacola_anterior          integer,
  revisao_anterior         integer,
  concluidos_anterior      integer,
  conversao_pct_anterior   numeric(6, 3),

  -- Audit
  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, period_start, period_end),
  check (period_end >= period_start)
);

create index ifood_cardapio_periodo_unit_idx
  on public.ifood_cardapio_periodo (unit_id, period_end desc);

alter table public.ifood_cardapio_periodo enable row level security;

create policy "ifood_cardapio_periodo_select_with_access"
  on public.ifood_cardapio_periodo for select
  using (public.has_unit_access(unit_id));
