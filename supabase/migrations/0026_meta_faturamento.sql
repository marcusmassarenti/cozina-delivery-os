--------------------------------------------------------------------
-- 0026_meta_faturamento.sql
-- Meta mensal de faturamento (bruto) por loja, pro relatório de
-- acompanhamento de vendas (formato "INFOS DIÁRIA VENDA").
-- FALTA = meta − total realizado no mês.
--------------------------------------------------------------------

alter table public.monthly_entries
  add column if not exists meta_faturamento numeric(12, 2) not null default 0;

comment on column public.monthly_entries.meta_faturamento is
  'Meta de faturamento bruto da loja no mês. FALTA = meta − total realizado.';
