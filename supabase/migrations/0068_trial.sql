--------------------------------------------------------------------
-- 0068_trial.sql
-- Cadastro self-service com 7 dias grátis. A holding do cliente novo nasce
-- com `trial_ends_at` = hoje + 7. Enquanto hoje <= trial_ends_at, o acesso é
-- liberado (billing "trial"); vencido e sem pagar → "suspended" (bloqueia).
-- Clientes antigos/pagantes têm trial_ends_at NULL e seguem pelo paid/due_date.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists trial_ends_at date;

comment on column public.holdings.trial_ends_at is
  'Fim do período de teste grátis (7 dias). NULL = sem trial (clientes antigos/pagantes).';
