--------------------------------------------------------------------
-- 0032_produtos_por_codigo.sql
-- A planilha real "Produtos vendidos" do JK NÃO traz a coluna Categoria —
-- só Cód. item + Descrição + Quantidade. Então o custo de vinagrete/bebidas
-- passa a referenciar por CÓDIGO de produto (chave estável).
--
-- Troca o modelo por-categoria (0031) por modelo por-código:
--   unit_produto_precos:    cadastro de preço por código (editável)
--   unit_produtos_vendidos: soma da quantidade por código, por semana
--
-- Seed: códigos do 1º arquivo do JK, com o preço da categoria correspondente
-- (cruzando código → categoria → preço da foto). "Não considerar" = off.
--------------------------------------------------------------------

-- Tabelas antigas (por categoria) saem.
drop table if exists public.unit_categoria_precos cascade;
drop table if exists public.unit_produtos_vendidos cascade;

-- 1) Cadastro de preço por código de produto.
create table public.unit_produto_precos (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  codigo      text not null,
  descricao   text,
  categoria   text,                            -- informativo (agrupar/exibir)
  preco       numeric not null default 0,
  considerar  boolean not null default true,   -- false = não entra na conta
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unit_id, codigo)
);

comment on table public.unit_produto_precos is
  'Preço por código de produto pro custo de vinagrete/maionese/bebidas. Editável.';

alter table public.unit_produto_precos enable row level security;

drop policy if exists unit_produto_precos_select on public.unit_produto_precos;
create policy unit_produto_precos_select
  on public.unit_produto_precos for select
  using (has_unit_access(unit_id));

create or replace function public.touch_unit_produto_precos()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists unit_produto_precos_touch on public.unit_produto_precos;
create trigger unit_produto_precos_touch
  before update on public.unit_produto_precos
  for each row execute function public.touch_unit_produto_precos();

-- 2) Soma de quantidade por código, por semana.
create table public.unit_produtos_vendidos (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  periodo_inicio  date not null,
  periodo_fim     date not null,
  codigo          text not null,
  descricao       text,
  quantidade      numeric not null default 0,
  created_at      timestamptz not null default now(),
  unique (unit_id, periodo_inicio, periodo_fim, codigo)
);

comment on table public.unit_produtos_vendidos is
  'Soma de quantidade por código (planilha "Produtos vendidos" do JK), por semana.';

create index if not exists unit_produtos_vendidos_unit_periodo_idx
  on public.unit_produtos_vendidos (unit_id, periodo_inicio desc);

alter table public.unit_produtos_vendidos enable row level security;

drop policy if exists unit_produtos_vendidos_select on public.unit_produtos_vendidos;
create policy unit_produtos_vendidos_select
  on public.unit_produtos_vendidos for select
  using (has_unit_access(unit_id));

-- 3) Seed dos preços do JK (código → preço, do 1º arquivo).
insert into public.unit_produto_precos
  (unit_id, codigo, descricao, categoria, preco, considerar)
select u.id, v.codigo, v.descricao, v.categoria, v.preco, v.considerar
from (
  select id from public.units where upper(trim(name)) = 'JK' limit 1
) u
cross join (values
  ('16', 'xxSUCO CAJUxx(P)', 'Sucos', 4.43, true),
  ('24', 'MOUSSE DE CHOCOLATE (churrasco)', 'Sobremesa', 5.87, true),
  ('62', 'xxSUCO MELANCIAxx(P)', 'Sucos', 4.43, true),
  ('63', 'xxSUCO ABACAXIxx ( P)', 'Sucos', 4.43, true),
  ('64', 'COM  T A L H E R', 'Talher', 0.60, true),
  ('65', 'SEM TALHER', 'Não considerar', 0.00, false),
  ('70', 'PERNIL DESFIADO (PRATO)', 'Vinagrete', 0.92, true),
  ('94', 'L E G U M E S   DEFUMADO', 'Não considerar', 0.00, false),
  ('97', 'F E I J A O    DEFUMADO', 'Não considerar', 0.00, false),
  ('101', 'PEITO DE FRANGO  DEFUMADO', 'Vinagrete', 0.92, true),
  ('103', 'BRISKET DEFUMADO(PRATO)', 'Vinagrete', 0.92, true),
  ('118', 'ASIAN CHICKEN BBQ  (PRATO)', 'Vinagrete', 0.92, true),
  ('130', 'BARBECUE TRADICIONAL', 'Não considerar', 0.00, false),
  ('133', 'PORCAO  COXINHA DA ASA  E L I N G U I C A', 'Não considerar', 0.00, false),
  ('138', 'A R R O Z   (DEF)', 'Não considerar', 0.00, false),
  ('163', 'SHIMEJI DEFUMADO (PRATO)', 'Vinagrete', 0.92, true),
  ('181', 'SUINO EM TIRAS (PRATO)', 'Vinagrete', 0.92, true),
  ('229', 'COXINHA DA ASA (PRATO)', 'Vinagrete', 0.92, true),
  ('296', 'xxx ITUBAINA xxx', 'Itubaina', 2.66, true),
  ('307', 'xxx LIMONETO xxx', 'Limoneto', 4.16, true),
  ('349', 'MAIONESE DEFUMADA  ARTESANAL', 'Maionese', 0.43, true),
  ('359', 'BARBECUE DE GOIABADA', 'Não considerar', 0.00, false),
  ('389', 'xxSUCO ACEROLAxx(P)', 'Sucos', 4.43, true),
  ('390', 'V I N A G R E T E  (DEF)', 'Vinagrete', 0.92, true),
  ('400', 'BRISKET  M  A  I  O  R   QUANTIDADE (PRATO)', 'Vinagrete', 0.92, true),
  ('402', 'COXINHA DA ASA  M A I O R QUANTIDADE (PRATO)', 'Vinagrete', 0.92, true),
  ('403', 'LINGUICA  M  A  I  O  R   QUANTIDADE  (PRATO)', 'Vinagrete', 0.92, true),
  ('405', 'SOBRECOXA  M  A  I  O  R  QUANTIDADE  (PRATO)', 'Vinagrete', 0.92, true),
  ('407', 'CUPIM  M  A  I  O  R  QUANTIDADE  (PRATO)', 'Vinagrete', 0.92, true),
  ('409', 'PULLED PORK M  A  I  O  R  QUANTIDADE (PRATO)', 'Vinagrete', 0.92, true),
  ('412', 'COSTELA    M  A  I  O  R   QUANTIDADE (PRATO)', 'Vinagrete', 0.92, true),
  ('424', 'ARROZ COM BROCOLIS', 'Não considerar', 0.00, false),
  ('430', 'ASIAN BBQ PORK DEFUMADO (PRATO)', 'Vinagrete', 0.92, true),
  ('436', 'COMBO SOBRECOXA  + BEBIDA', 'Vinagrete', 0.92, true),
  ('469', 'PEDACO DE MILHO 3 UNIDADES', 'Não considerar', 0.00, false),
  ('479', 'F A R O F A   CROCANTE', 'Não considerar', 0.00, false),
  ('531', 'xxx AGUA COM GAS xxx', 'Agua com Gas', 2.05, true),
  ('601', 'xxx H2O xxx', 'H2O', 4.67, true),
  ('604', 'xxx CERVEJA HEINEKEN xxx', 'Heineken', 6.20, true),
  ('710', 'ECLAIR DE CREME (churrasco)', 'Eclair', 7.35, true),
  ('716', 'xxx COCA ZERO xxx', 'Coca Zero', 3.47, true),
  ('1599', 'PEITO DE FRANGO (PRATO)', 'Vinagrete', 0.92, true),
  ('1711', 'xxx GUARANA ZERO xxx', 'Guarana Zero', 3.48, true),
  ('1761', 'xxx AGUA xxx', 'Agua Sem Gas', 2.00, true),
  ('2371', 'PULLED PORK DEFUMADO(PRATO)', 'Vinagrete', 0.92, true),
  ('2401', 'CUPIM DEFUMADO (PRATO)', 'Vinagrete', 0.92, true),
  ('2411', 'SOBRECOXA DEFUMADA(PRATO)', 'Vinagrete', 0.92, true),
  ('2421', 'LINGUICA DEFUMADA ( PRATO )', 'Vinagrete', 0.92, true),
  ('2431', 'COSTELA   BOVINA    (PRATO)', 'Vinagrete', 0.92, true),
  ('3813', 'xxx GUARANA xxx', 'Guarana', 3.48, true),
  ('3814', 'xxx PEPSI ZERO xxx', 'Pepsi Zero', 3.16, true),
  ('5008', 'xxx COCA COLA xxx', 'Coca Cola', 3.45, true),
  ('5018', 'BATATA  ACOMPANHAMENTO (chu)', 'Não considerar', 0.00, false),
  ('5031', 'S A N D U B A   CUPIM DEFUMADO', 'Vinagrete', 0.92, true),
  ('5032', 'S A N D U B A   COSTELA BOVINA', 'Vinagrete', 0.92, true),
  ('5033', 'S A N D U B A   LINGUICA DEFUMADA', 'Vinagrete', 0.92, true),
  ('5034', 'S A N D U B A   BRISKET DEFUMADO', 'Vinagrete', 0.92, true),
  ('5035', 'S A N D U B A   SOBRECOXA DEFUMADA', 'Vinagrete', 0.92, true),
  ('5036', 'S A N D U B A   PULLED PORK', 'Vinagrete', 0.92, true),
  ('5091', 'xxSUCO MORANGOxx(P)', 'Sucos', 4.43, true),
  ('5101', 'BRIGADEIRO DE COLHER(Churrasco)', 'Brigadeiro', 0.00, true),
  ('5171', 'xxSUCO MARACUJAxx(P)', 'Sucos', 4.43, true),
  ('5181', 'xxSUCO LIMAOxx(P)', 'Sucos', 4.43, true),
  ('5191', 'xxSUCO LARANJAxx(P)', 'Sucos', 4.43, true),
  ('5201', 'xxSUCO MANGAxx(P)', 'Sucos', 4.43, true)
) as v(codigo, descricao, categoria, preco, considerar)
on conflict (unit_id, codigo) do nothing;
