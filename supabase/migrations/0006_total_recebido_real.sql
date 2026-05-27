--------------------------------------------------------------------
-- 0006_total_recebido_real.sql
-- Adiciona faturamento real recebido (o que efetivamente caiu na conta)
-- para confrontar com o calculado das plataformas e detectar divergências.
--------------------------------------------------------------------

alter table public.monthly_entries
  add column if not exists total_recebido_real numeric(12, 2) not null default 0;
