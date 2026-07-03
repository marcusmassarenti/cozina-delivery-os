--------------------------------------------------------------------
-- 0072_unit_cost_categories.sql
-- Custos da loja por CATEGORIA (por unidade). Cada categoria é do tipo
-- 'cmv' (mercadoria: vinagrete, bebidas, descartáveis…) ou 'operacao'
-- (funcionários, aluguel…). Os valores são por mês.
--
-- A SOMA das categorias é escrita de volta nos campos que o DRE já usa em
-- monthly_entries (cmv → custo_produtos_loja; operacao → custo_operacao), então
-- o DRE / Resultado / alerta de CMV 40% continuam funcionando sem mudança.
--------------------------------------------------------------------

create table if not exists public.unit_cost_categories (
  id          uuid primary key default uuid_generate_v4(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('cmv', 'operacao')),
  sort        integer not null default 0,
  arquivada   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists unit_cost_categories_unit_idx
  on public.unit_cost_categories (unit_id);

create table if not exists public.unit_cost_values (
  id          uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.unit_cost_categories(id) on delete cascade,
  unit_id     uuid not null references public.units(id) on delete cascade,
  ano         integer not null,
  mes         integer not null check (mes between 1 and 12),
  valor       numeric(12, 2) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (category_id, ano, mes)
);

create index if not exists unit_cost_values_lookup_idx
  on public.unit_cost_values (unit_id, ano, mes);

alter table public.unit_cost_categories enable row level security;
alter table public.unit_cost_values enable row level security;

-- Leitura respeita o acesso à unidade (escrita é via server action/service_role).
create policy "unit_cost_categories_select_with_access"
  on public.unit_cost_categories for select
  using (public.has_unit_access(unit_id));

create policy "unit_cost_values_select_with_access"
  on public.unit_cost_values for select
  using (public.has_unit_access(unit_id));

comment on table public.unit_cost_categories is
  'Categorias de custo por unidade (tipo cmv|operacao). Detalham o CMV da loja e o custo operacional.';
comment on table public.unit_cost_values is
  'Valor de cada categoria de custo por mês. A soma alimenta monthly_entries (DRE).';
