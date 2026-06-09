--------------------------------------------------------------------
-- 0050_caixa_cartao_fatura.sql
--
-- Cartão de crédito com fatura isolada: compras no cartão NÃO impactam o
-- fluxo de caixa — ficam na fatura (competência invoice_year/month) e
-- debitam o limite. Parcelamento gera 1 lançamento por fatura.
--------------------------------------------------------------------

alter table public.fin_entries
  add column installment_no    integer,   -- nº da parcela (1..N)
  add column installment_total integer,   -- total de parcelas
  add column invoice_year       integer,  -- competência da fatura (cartão)
  add column invoice_month      integer check (invoice_month is null or (invoice_month >= 1 and invoice_month <= 12)),
  add column is_card_payment    boolean not null default false, -- "pagamento de fatura" (entra no caixa)
  add column hidden             boolean not null default false;  -- esconder na fatura (estorno/duplicado)

create index fin_entries_invoice_idx
  on public.fin_entries (account_id, invoice_year, invoice_month)
  where account_id is not null;

comment on column public.fin_entries.invoice_year is
  'Competência da fatura do cartão (ano). Compras de cartão são agrupadas por aqui.';
comment on column public.fin_entries.is_card_payment is
  'TRUE = pagamento da fatura do cartão (esse sim entra no fluxo de caixa).';
