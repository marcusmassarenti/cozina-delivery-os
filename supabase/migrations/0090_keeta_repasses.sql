--------------------------------------------------------------------
-- 0090_keeta_repasses.sql
-- Repasse (settlement) da Keeta — vem da aba "Detalhes da fatura" do
-- arquivo de Fatura consolidada (bill-...). 1 linha por (loja, dia):
-- quanto será repassado e QUANDO cai (data de liquidação + ciclo semanal).
-- É o que os relatórios de pedido NÃO trazem: o calendário de recebíveis.
--------------------------------------------------------------------

create table public.keeta_repasses (
  id                 uuid primary key default uuid_generate_v4(),
  unit_id            uuid not null references public.units(id) on delete cascade,

  data_transacao     date not null,                 -- "Data da transação" (dia dos pedidos)
  ref_year           integer not null,
  ref_month          integer not null check (ref_month >= 1 and ref_month <= 12),

  ciclo_faturamento  text,                          -- "Ciclo de faturamento" (ex.: 2026.06.01~2026.06.07)
  data_liquidacao    date,                          -- "Data da liquidação" (quando o dinheiro cai)
  status             text,                          -- "Status do repasse" (Liquidado / A liquidar / ...)
  valor_repasse      numeric(14, 2),                -- "Pagamento total" (repasse do dia)
  cnpj               text,                          -- "CNPJ" da loja

  import_id          uuid references public.platform_imports(id) on delete set null,
  imported_at        timestamptz not null default now(),

  unique (unit_id, data_transacao)
);

create index keeta_repasses_unit_ref_idx
  on public.keeta_repasses (unit_id, ref_year, ref_month);
create index keeta_repasses_liquidacao_idx
  on public.keeta_repasses (unit_id, data_liquidacao);

alter table public.keeta_repasses enable row level security;

create policy "keeta_repasses_select_with_access"
  on public.keeta_repasses for select
  using (public.has_unit_access(unit_id));
