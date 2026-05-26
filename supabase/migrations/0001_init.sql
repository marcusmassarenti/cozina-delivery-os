--------------------------------------------------------------------
-- Cozina Delivery OS — multi-tenant core schema (0001_init)
--
-- Cria:
--   - holdings, brands, units, user_unit_access
--   - tipos enum: access_scope, access_role
--   - funções helper para RLS: has_holding_access, has_brand_access, has_unit_access
--   - políticas RLS de SELECT em todas as tabelas
--   - seed: Cozina Foods + Churrasco no Pote
--
-- Como rodar:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Cole este arquivo inteiro
--   3. Run
--   4. Verifique em Table Editor que as 4 tabelas existem
--------------------------------------------------------------------

create extension if not exists "uuid-ossp";

--------------------------------------------------------------------
-- Tipos enum
--------------------------------------------------------------------

create type public.access_scope as enum ('holding', 'brand', 'unit');
create type public.access_role as enum ('admin', 'manager', 'viewer');

--------------------------------------------------------------------
-- Tabelas
--------------------------------------------------------------------

-- holdings: rede / grupo controlador (no v1, só Cozina Foods)
create table public.holdings (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- brands: marcas de uma holding (Churrasco no Pote + futuras)
create table public.brands (
  id          uuid primary key default uuid_generate_v4(),
  holding_id  uuid not null references public.holdings(id) on delete restrict,
  name        text not null,
  slug        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  unique (holding_id, slug)
);

-- units: unidades operacionais (lojas franqueadas)
create table public.units (
  id          uuid primary key default uuid_generate_v4(),
  brand_id    uuid not null references public.brands(id) on delete restrict,
  code        text not null,          -- "2", "JK", "02-JK" — formato livre
  name        text not null,
  cnpj        text,                   -- 14 dígitos sem formatação
  city        text,
  state       text,                   -- UF de 2 letras
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (brand_id, code)
);

-- user_unit_access: define quem vê o quê
-- scope_type='holding'  → vê toda a holding (e tudo abaixo)
-- scope_type='brand'    → vê toda a marca (e suas unidades)
-- scope_type='unit'     → vê só uma unidade
create table public.user_unit_access (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope_type  public.access_scope not null,
  scope_id    uuid not null,
  role        public.access_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  unique (user_id, scope_type, scope_id)
);

create index user_unit_access_user_idx  on public.user_unit_access (user_id);
create index user_unit_access_scope_idx on public.user_unit_access (scope_type, scope_id);

--------------------------------------------------------------------
-- Funções helper para RLS
--
-- security definer + search_path = public garante que a função
-- bypassa RLS internamente (evita recursão) e está protegida
-- contra search_path injection.
--------------------------------------------------------------------

create or replace function public.has_holding_access(p_holding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_unit_access
    where user_id = auth.uid()
      and scope_type = 'holding'
      and scope_id = p_holding_id
  )
$$;

create or replace function public.has_brand_access(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brands b
    where b.id = p_brand_id
      and (
        public.has_holding_access(b.holding_id)
        or exists (
          select 1 from public.user_unit_access
          where user_id = auth.uid()
            and scope_type = 'brand'
            and scope_id = p_brand_id
        )
      )
  )
$$;

create or replace function public.has_unit_access(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.units u
    where u.id = p_unit_id
      and (
        public.has_brand_access(u.brand_id)
        or exists (
          select 1 from public.user_unit_access
          where user_id = auth.uid()
            and scope_type = 'unit'
            and scope_id = p_unit_id
        )
      )
  )
$$;

--------------------------------------------------------------------
-- Row Level Security
--------------------------------------------------------------------

alter table public.holdings          enable row level security;
alter table public.brands            enable row level security;
alter table public.units             enable row level security;
alter table public.user_unit_access  enable row level security;

create policy "holdings_select_with_access"
  on public.holdings for select
  using (public.has_holding_access(id));

create policy "brands_select_with_access"
  on public.brands for select
  using (public.has_brand_access(id));

create policy "units_select_with_access"
  on public.units for select
  using (public.has_unit_access(id));

create policy "user_unit_access_select_own"
  on public.user_unit_access for select
  using (user_id = auth.uid());

-- v0.1: INSERT/UPDATE/DELETE feitos via Supabase Dashboard ou service_role.
-- Quando o app tiver telas de admin, adicionamos policies de modificação.

--------------------------------------------------------------------
-- Seeds iniciais
--------------------------------------------------------------------

insert into public.holdings (name, slug)
values ('Cozina Foods', 'cozina-foods');

insert into public.brands (holding_id, name, slug, color)
select id, 'Churrasco no Pote', 'churrasco-no-pote', '#FF4D00'
from public.holdings where slug = 'cozina-foods';
