--------------------------------------------------------------------
-- 0002_unit_platforms.sql
-- Quais plataformas cada unidade opera (iFood, 99 Food, Keeta).
-- v1: só registra que a unidade está em X, sem credenciais. Quando
-- conectarmos iFood OAuth de verdade, adicionamos colunas de token.
--------------------------------------------------------------------

create table public.unit_platforms (
  unit_id     uuid not null references public.units(id) on delete cascade,
  platform    text not null check (platform in ('ifood', '99food', 'keeta')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (unit_id, platform)
);

alter table public.unit_platforms enable row level security;

create policy "unit_platforms_select_with_access"
  on public.unit_platforms for select
  using (public.has_unit_access(unit_id));
