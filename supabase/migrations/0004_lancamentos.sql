--------------------------------------------------------------------
-- 0004_lancamentos.sql
-- daily_entries: lançamento por unit / data / plataforma
-- monthly_entries: complemento mensal (taxas, custos, VR, observações)
--------------------------------------------------------------------

create table public.daily_entries (
  id           uuid primary key default uuid_generate_v4(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  date         date not null,
  platform     text not null check (platform in ('ifood', '99food', 'keeta')),
  pedidos      integer not null default 0,
  cancelados   integer not null default 0,
  faturamento  numeric(12, 2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (unit_id, date, platform)
);

create index daily_entries_unit_date_idx
  on public.daily_entries(unit_id, date);

alter table public.daily_entries enable row level security;

create policy "daily_entries_select_with_access"
  on public.daily_entries for select
  using (public.has_unit_access(unit_id));

create table public.monthly_entries (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,
  year                     integer not null,
  month                    integer not null check (month >= 1 and month <= 12),
  taxa_entrega_ifood       numeric(12, 2) not null default 0,
  promocoes                numeric(12, 2) not null default 0,
  taxa_comissao_ifood      numeric(12, 2) not null default 0,
  servicos_logisticos      numeric(12, 2) not null default 0,
  outros_descontos_ifood   numeric(12, 2) not null default 0,
  vr_recebido              numeric(12, 2) not null default 0,
  vr_taxa_media_8          numeric(12, 2) not null default 0,
  cancelamentos_reembolsos numeric(12, 2) not null default 0,
  custo_produtos_cozina    numeric(12, 2) not null default 0,
  custo_produtos_loja      numeric(12, 2) not null default 0,
  clientes_novos           integer not null default 0,
  nota_media               numeric(3, 1) not null default 0,
  observacoes              text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (unit_id, year, month)
);

create index monthly_entries_unit_idx
  on public.monthly_entries(unit_id, year, month);

alter table public.monthly_entries enable row level security;

create policy "monthly_entries_select_with_access"
  on public.monthly_entries for select
  using (public.has_unit_access(unit_id));
