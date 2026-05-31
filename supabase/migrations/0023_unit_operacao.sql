--------------------------------------------------------------------
-- 0023_unit_operacao.sql
-- Data de inauguração e encerramento da unidade. Usado pra Cobertura
-- "inteligente": meses antes de inaugurar / depois de encerrar não contam
-- como lacuna (viram N/A) e a janela de dias esperados é recortada pra o
-- período em que a loja realmente operou.
--------------------------------------------------------------------

alter table public.units
  add column if not exists data_inauguracao date,
  add column if not exists data_encerramento date;

comment on column public.units.data_inauguracao is
  'Data de inauguração da loja. Antes dela, a cobertura marca N/A (não cobra dado).';
comment on column public.units.data_encerramento is
  'Data de encerramento (null = ativa). Depois dela, a cobertura marca N/A.';
