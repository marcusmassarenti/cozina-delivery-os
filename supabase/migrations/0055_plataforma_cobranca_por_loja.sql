--------------------------------------------------------------------
-- 0055_plataforma_cobranca_por_loja.sql
--
-- Cobrança do SaaS por loja (super-admin / visão de dono):
--   mensalidade = base (monthly_fee) + (lojas além das inclusas × price_per_unit)
--
-- + histórico de pagamentos por cliente (holding_payments).
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

-- 1) Preço por loja adicional + quantas lojas já vêm na base
alter table public.holdings
  add column if not exists price_per_unit numeric(10, 2),
  add column if not exists included_units integer not null default 1;

-- 2) Histórico de pagamentos do cliente (cada mensalidade recebida)
create table if not exists public.holding_payments (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings (id) on delete cascade,
  paid_on date not null,
  amount numeric(10, 2) not null,
  method text,
  ref_month text, -- competência, ex.: "2026-06"
  note text,
  created_at timestamptz not null default now()
);

create index if not exists holding_payments_holding_idx
  on public.holding_payments (holding_id, paid_on desc);

-- Só o super-admin (service_role) acessa; RLS liga sem policy pública.
alter table public.holding_payments enable row level security;

comment on column public.holdings.price_per_unit is
  'Valor adicional por loja além das inclusas (cobrança SaaS).';
comment on column public.holdings.included_units is
  'Quantas lojas já estão inclusas na mensalidade base.';
