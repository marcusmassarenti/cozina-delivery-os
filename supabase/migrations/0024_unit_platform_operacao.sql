--------------------------------------------------------------------
-- 0024_unit_platform_operacao.sql
-- Inauguração/encerramento POR PLATAFORMA. Uma loja pode entrar no iFood,
-- 99 e Keeta em datas diferentes — então a janela de operação da Cobertura
-- passa a usar a data da plataforma quando existir, caindo na data da
-- unidade (0023) como padrão.
--------------------------------------------------------------------

alter table public.unit_platforms
  add column if not exists data_inauguracao date,
  add column if not exists data_encerramento date;

comment on column public.unit_platforms.data_inauguracao is
  'Inauguração da loja NESSA plataforma. Se null, usa units.data_inauguracao.';
comment on column public.unit_platforms.data_encerramento is
  'Encerramento da loja NESSA plataforma. Se null, usa units.data_encerramento.';
