--------------------------------------------------------------------
-- 0049_caixa_recorrencia_cartao.sql
--
-- Evolui o módulo de caixa: lançamentos recorrentes + dados de cartão.
--------------------------------------------------------------------

-- Recorrência: lançamentos gerados em série compartilham um grupo.
alter table public.fin_entries
  add column recurrence_group uuid;

create index fin_entries_recurrence_idx
  on public.fin_entries (recurrence_group)
  where recurrence_group is not null;

-- Cartão: limite e dias de fechamento/vencimento da fatura.
alter table public.fin_accounts
  add column card_limit  numeric(14, 2),
  add column closing_day integer check (closing_day is null or (closing_day >= 1 and closing_day <= 31)),
  add column due_day     integer check (due_day is null or (due_day >= 1 and due_day <= 31));

comment on column public.fin_entries.recurrence_group is
  'Liga os lançamentos de uma mesma série recorrente (mensal).';
comment on column public.fin_accounts.card_limit is
  'Limite do cartão (kind=cartao).';
