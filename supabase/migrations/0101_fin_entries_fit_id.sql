--------------------------------------------------------------------
-- 0101_fin_entries_fit_id.sql
-- Import de extrato bancário (OFX). Guarda o FITID (id da transação no
-- extrato) pra não reimportar o mesmo lançamento duas vezes.
--------------------------------------------------------------------

alter table public.fin_entries
  add column if not exists fit_id text;

comment on column public.fin_entries.fit_id is 'ID da transação no extrato OFX (FITID) — usado pra não reimportar o mesmo lançamento.';

create unique index if not exists fin_entries_account_fit_uidx
  on public.fin_entries (account_id, fit_id)
  where fit_id is not null;
