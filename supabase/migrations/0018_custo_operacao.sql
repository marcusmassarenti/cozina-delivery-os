--------------------------------------------------------------------
-- 0018_custo_operacao.sql
-- Custo da operação (aluguel, folha, etc.) por unidade/mês.
-- Complementa o CMV (custo dos produtos) pra fechar o Resultado
-- operacional no DRE da rede. Opcional — franqueado pode preencher.
--------------------------------------------------------------------

alter table public.monthly_entries
  add column if not exists custo_operacao numeric(12, 2) not null default 0;

comment on column public.monthly_entries.custo_operacao is
  'Custo da operação da loja no mês (aluguel, folha, energia, etc.). Opcional. Entra no DRE abaixo do CMV pra calcular o resultado operacional.';
