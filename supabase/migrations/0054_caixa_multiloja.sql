--------------------------------------------------------------------
-- 0054_caixa_multiloja.sql
--
-- Multi-loja no Caixa: cada conta/cartão pode pertencer a uma loja
-- (unit_id) ou à "Rede" (unit_id null = compartilhada). Os lançamentos
-- já têm unit_id (migration 0048). Categorias e cadastros continuam
-- compartilhados na rede (holding).
--------------------------------------------------------------------

alter table public.fin_accounts
  add column unit_id uuid references public.units(id) on delete set null;

create index fin_accounts_unit_idx on public.fin_accounts (holding_id, unit_id);

comment on column public.fin_accounts.unit_id is
  'Loja dona da conta/cartão. NULL = conta da Rede (compartilhada).';
