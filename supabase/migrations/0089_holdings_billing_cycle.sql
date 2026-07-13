-- Ciclo de cobrança da assinatura (self-service): mensal ou anual.
-- Anual é cobrado à vista no cartão (12 meses de uma vez, cycle YEARLY no Asaas);
-- mensal é recorrente. Nulo = ainda não assinou / legado (tratado como mensal).
alter table public.holdings
  add column if not exists billing_cycle text
    check (billing_cycle in ('mensal', 'anual'));

comment on column public.holdings.billing_cycle is
  'Ciclo da assinatura Asaas: mensal (recorrente) ou anual (à vista no cartão, 1x/ano). Nulo = legado/mensal.';
