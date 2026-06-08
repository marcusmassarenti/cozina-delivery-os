--------------------------------------------------------------------
-- Cobrança / assinatura por cliente (holding) — controle manual
--
-- O super-admin define forma de pagamento, valor, vencimento e se está pago.
-- Se NÃO estiver pago:
--   - passou do vencimento  → "Em atraso" (aviso pro cliente)
--   - passou da data de suspensão → acesso SUSPENSO (bloqueia o login do cliente)
-- Super-admin nunca é bloqueado.
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists payment_method text,
  add column if not exists monthly_fee numeric(10, 2),
  add column if not exists due_date date,
  add column if not exists paid boolean not null default true,
  add column if not exists suspend_on date;

-- Clientes atuais entram como "pago" (default true) pra ninguém ser bloqueado.
