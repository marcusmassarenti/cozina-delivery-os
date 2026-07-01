--------------------------------------------------------------------
-- 0069_asaas.sql
-- Integração com o gateway Asaas (assinatura recorrente self-service).
-- Guardamos na holding o id do cliente e da assinatura no Asaas pra amarrar os
-- webhooks de pagamento à empresa certa. asaas_last_event é só depuração.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists asaas_last_event jsonb;

create index if not exists holdings_asaas_subscription_idx
  on public.holdings (asaas_subscription_id);
create index if not exists holdings_asaas_customer_idx
  on public.holdings (asaas_customer_id);

comment on column public.holdings.asaas_customer_id is
  'ID do cliente (customer) no Asaas.';
comment on column public.holdings.asaas_subscription_id is
  'ID da assinatura recorrente (subscription) no Asaas.';
comment on column public.holdings.asaas_last_event is
  'Último evento de webhook recebido do Asaas (depuração).';
