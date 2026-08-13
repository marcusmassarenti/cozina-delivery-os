-- Forma de cobrança da assinatura, POR CLIENTE.
--
-- Era constante no código (`BILLING_TYPE = 'CREDIT_CARD'`), com a justificativa
-- certa: cartão é o único que cobra sozinho todo mês. Pix e boleto geram uma
-- cobrança por ciclo que o cliente paga na mão.
--
-- Só que "o padrão certo" e "a única opção" são coisas diferentes. A DG FOODS
-- (56 lojas, R$ 3.500/mês) fechou em Pix, e a alternativa era ficar fora do
-- Asaas em cobrança manual — sem fatura, sem lembrete, dependendo de alguém
-- marcar "pago" todo mês. É esse manual que fez o cron billing-vencimentos
-- existir.
--
-- NULL = CREDIT_CARD. O padrão segue o de antes pra todo mundo; quem pede
-- outra forma vira exceção explícita, não regra nova.
alter table public.holdings
  add column if not exists asaas_billing_type text;

alter table public.holdings
  drop constraint if exists holdings_asaas_billing_type_check;
alter table public.holdings
  add constraint holdings_asaas_billing_type_check
  check (asaas_billing_type is null
         or asaas_billing_type in ('CREDIT_CARD','PIX','BOLETO','UNDEFINED'));

comment on column public.holdings.asaas_billing_type is
  'Forma de cobrança da assinatura no Asaas. NULL = CREDIT_CARD (padrão: cobra sozinho). PIX/BOLETO emitem cobrança por ciclo que o cliente paga manualmente. UNDEFINED deixa o cliente escolher no checkout.';
