--------------------------------------------------------------------
-- 0031_produtos_vendidos_categoria_precos.sql
-- Custo "Vinagrete / maionese / bebidas" do fechamento, a partir da
-- planilha "Produtos vendidos" que o JK exporta toda semana.
--
-- Lógica: soma a Quantidade por Categoria (menos "Não considerar") e
-- multiplica pelo preço cadastrado da categoria. A soma vira a referência
-- (cinza) do custo de vinagrete no fechamento. Os preços são editáveis.
--------------------------------------------------------------------

-- 1) Planilha semanal: soma de quantidade por categoria, por unidade/semana.
create table if not exists public.unit_produtos_vendidos (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  periodo_inicio  date not null,
  periodo_fim     date not null,
  categoria       text not null,
  quantidade      numeric not null default 0,
  created_at      timestamptz not null default now(),
  unique (unit_id, periodo_inicio, periodo_fim, categoria)
);

comment on table public.unit_produtos_vendidos is
  'Soma de quantidade por categoria da planilha "Produtos vendidos" (JK), por semana.';

create index if not exists unit_produtos_vendidos_unit_periodo_idx
  on public.unit_produtos_vendidos (unit_id, periodo_inicio desc);

alter table public.unit_produtos_vendidos enable row level security;

drop policy if exists unit_produtos_vendidos_select on public.unit_produtos_vendidos;
create policy unit_produtos_vendidos_select
  on public.unit_produtos_vendidos for select
  using (has_unit_access(unit_id));
-- Escrita só via service_role (server actions guardadas no app).

-- 2) Cadastro editável de preço por categoria (multiplica a quantidade).
create table if not exists public.unit_categoria_precos (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  categoria   text not null,
  preco       numeric not null default 0,
  considerar  boolean not null default true,  -- false = "Não considerar"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unit_id, categoria)
);

comment on table public.unit_categoria_precos is
  'Preço por categoria pro cálculo do custo de vinagrete/maionese/bebidas. Editável.';

alter table public.unit_categoria_precos enable row level security;

drop policy if exists unit_categoria_precos_select on public.unit_categoria_precos;
create policy unit_categoria_precos_select
  on public.unit_categoria_precos for select
  using (has_unit_access(unit_id));

create or replace function public.touch_unit_categoria_precos()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists unit_categoria_precos_touch on public.unit_categoria_precos;
create trigger unit_categoria_precos_touch
  before update on public.unit_categoria_precos
  for each row execute function public.touch_unit_categoria_precos();

-- 3) Seed dos preços do JK (nomes exatos da categoria como vêm na planilha,
--    valores da foto enviada pelo Marcus). "Não considerar" = considerar=false.
insert into public.unit_categoria_precos (unit_id, categoria, preco, considerar)
select u.id, v.categoria, v.preco, v.considerar
from (
  select id from public.units where upper(trim(name)) = 'JK' limit 1
) u
cross join (values
  ('Vinagrete',      0.92, true),
  ('Talher',         0.60, true),
  ('Maionese',       0.43, true),
  ('Coca Zero',      3.47, true),
  ('Coca Cola',      3.45, true),
  ('Sucos',          4.43, true),
  ('Limoneto',       4.16, true),
  ('Eclair',         7.35, true),
  ('Guarana Zero',   3.48, true),
  ('Guarana',        3.48, true),
  ('H2O',            4.67, true),
  ('Sobremesa',      5.87, true),
  ('Heineken',       6.20, true),
  ('Agua Sem Gas',   2.00, true),
  ('Agua com Gas',   2.05, true),
  ('Pepsi Zero',     3.16, true),
  ('Itubaina',       2.66, true),
  ('Brigadeiro',     0.00, true),
  ('Soda',           3.21, true),
  ('Schweppes',      3.82, true),
  ('Não considerar', 0.00, false)
) as v(categoria, preco, considerar)
on conflict (unit_id, categoria) do nothing;
