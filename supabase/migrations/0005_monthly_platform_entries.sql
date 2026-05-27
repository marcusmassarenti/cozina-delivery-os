--------------------------------------------------------------------
-- 0005_monthly_platform_entries.sql
-- Taxas/VR/cancelamentos passam a ser POR plataforma.
-- monthly_entries continua existindo só pra dados gerais (custos
-- cozina, nota média, observações, clientes novos).
--------------------------------------------------------------------

create table public.monthly_platform_entries (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,
  year                     integer not null,
  month                    integer not null check (month >= 1 and month <= 12),
  platform                 text not null check (platform in ('ifood', '99food', 'keeta')),
  taxa_entrega             numeric(12, 2) not null default 0,
  promocoes                numeric(12, 2) not null default 0,
  taxa_comissao            numeric(12, 2) not null default 0,
  servicos_logisticos      numeric(12, 2) not null default 0,
  outros_descontos         numeric(12, 2) not null default 0,
  vr_recebido              numeric(12, 2) not null default 0,
  cancelamentos_reembolsos numeric(12, 2) not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (unit_id, year, month, platform)
);

create index monthly_platform_entries_unit_idx
  on public.monthly_platform_entries(unit_id, year, month);

alter table public.monthly_platform_entries enable row level security;

create policy "monthly_platform_entries_select_with_access"
  on public.monthly_platform_entries for select
  using (public.has_unit_access(unit_id));
