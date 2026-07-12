-- 0084 · Segurança de cobrança: separa "plano escolhido" de "plano pago"
--
-- Antes, plan_tier era gravado quando o cliente ESCOLHIA a assinatura (antes de
-- pagar), e os gates (isProPlan/isAiPlan) liberavam features só olhando o tier.
-- Resultado: dava pra escolher o AI (R$159) e usar de graça no trial sem pagar.
--
-- Agora:
--   * pending_plan_tier = plano escolhido, aguardando pagamento (só exibição +
--     cálculo do valor + o que conceder quando o pagamento confirmar);
--   * plan_tier = plano EFETIVAMENTE pago (fonte da verdade das features),
--     gravado só pelo webhook do Asaas em pagamento confirmado.

alter table public.holdings
  add column if not exists pending_plan_tier text
    check (pending_plan_tier in ('essencial', 'pro', 'ai'));
