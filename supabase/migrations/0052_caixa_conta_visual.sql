--------------------------------------------------------------------
-- 0052_caixa_conta_visual.sql
--
-- Visual da conta: cor + opção de não somar no saldo geral + logo URL
-- (custom). O slug do banco continua em fin_accounts.bank.
--------------------------------------------------------------------

alter table public.fin_accounts
  add column color              text,
  add column exclude_from_total boolean not null default false,
  add column logo_url           text;  -- logo custom (opcional), pra "Outro"

comment on column public.fin_accounts.color is 'Cor do card da conta (hex/tailwind).';
comment on column public.fin_accounts.exclude_from_total is
  'TRUE = não soma no Saldo Geral (ex: conta de reserva/investimento).';
