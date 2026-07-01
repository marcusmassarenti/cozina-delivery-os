--------------------------------------------------------------------
-- 0071_plan_tiers.sql
-- Preço POR LOJA em dois planos (bate com a landing):
--   Essencial = R$49/loja · mês   |   Pro = R$99/loja · mês
-- - platform_settings ganha os dois preços por loja (editáveis pelo dono).
-- - holdings.plan_tier guarda qual plano o cliente self-service escolheu.
-- Os campos antigos (default_monthly_fee/price_per_unit/included_units) do 0070
-- deixam de ser usados pelo self-service, mas ficam pra não quebrar nada.
--------------------------------------------------------------------

alter table public.platform_settings
  add column if not exists essencial_per_unit numeric not null default 49,
  add column if not exists pro_per_unit numeric not null default 99;

alter table public.holdings
  add column if not exists plan_tier text
  check (plan_tier in ('essencial', 'pro'));

comment on column public.platform_settings.essencial_per_unit is
  'Preço por loja/mês do plano Essencial (self-service).';
comment on column public.platform_settings.pro_per_unit is
  'Preço por loja/mês do plano Pro (self-service).';
comment on column public.holdings.plan_tier is
  'Plano escolhido pelo cliente self-service: essencial | pro. NULL = não escolheu.';
