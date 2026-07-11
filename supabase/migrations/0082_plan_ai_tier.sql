-- 0082: Terceiro plano self-service — DeliveryOS AI (R$159/loja).
-- Preço editável em platform_settings + libera plan_tier = 'ai' nas holdings.
-- Hierarquia: essencial < pro (+ financeiro) < ai (+ DeliveryOS AI).

alter table platform_settings
  add column if not exists ai_per_unit numeric default 159;

-- Amplia o CHECK de plan_tier pra aceitar o novo tier 'ai'.
alter table holdings drop constraint if exists holdings_plan_tier_check;
alter table holdings add constraint holdings_plan_tier_check
  check (plan_tier in ('essencial', 'pro', 'ai'));
