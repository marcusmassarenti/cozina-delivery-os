--------------------------------------------------------------------
-- 0046_ninefood_bill.sql
--
-- 99 Food — extrato financeiro PEDIDO-A-PEDIDO vindo da API oficial
-- (Financial API → getShopBillDetail). É a fonte "automática" do 99,
-- paralela ao import manual (ninefood_daily_loja). O DRE vai PREFERIR
-- esta tabela quando houver dados, e cair no manual quando não houver.
--
-- 1 linha = 1 transação (orderType: 1 receita, 2 reembolso, 3 reembolso
-- parcial, 4 pós-venda, 5 sem-acompanhamento). Um mesmo order_id pode ter
-- mais de uma linha (ex.: receita + reembolso), por isso a unicidade é
-- (unit_id, order_id, order_type).
--
-- Valores monetários: a API devolve em CENTAVOS (int). O sync converte
-- pra REAIS (÷100) e grava aqui em numeric(14,2), consistente com o resto.
-- commission_rate é gravado em PERCENTUAL (ex.: 35.00).
--
-- O mapeamento unit_id ↔ loja do 99 usa unit_platforms.external_store_id
-- (= app_shop_id / acceptor_code), criado na migration 0007.
--------------------------------------------------------------------

create table public.ninefood_bill (
  id            uuid primary key default uuid_generate_v4(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  app_shop_id   text not null,                 -- acceptor_code usado na consulta

  -- Identificação do pedido
  order_id      text not null,
  order_index   text,
  order_type    integer not null,             -- 1/2/3/4/5
  delivery_type integer,                       -- 0/1/2/20

  -- Período (data derivada de business_ts em America/Sao_Paulo)
  business_ts        bigint,
  business_datetime  text,
  data               date not null,
  ref_year           integer not null,
  ref_month          integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Financeiro (REAIS, já convertido de centavos)
  meal_original          numeric(14, 2) not null default 0, -- mealOriginalAmount
  shop_activity_outcome  numeric(14, 2) not null default 0, -- gasto da loja c/ desconto item
  shop_activity_subsidy  numeric(14, 2) not null default 0, -- subsídio plataforma p/ desconto item
  shop_delivery          numeric(14, 2) not null default 0, -- taxa entrega recebida (auto-entrega)
  shop_pre_tips          numeric(14, 2) not null default 0, -- gorjeta
  free_delivery_outcome  numeric(14, 2) not null default 0, -- custo loja c/ frete grátis
  free_delivery_subsidy  numeric(14, 2) not null default 0, -- subsídio plataforma frete grátis
  commission_base        numeric(14, 2) not null default 0, -- base da comissão
  commission_rate        numeric(7, 4)  not null default 0, -- % (35.00)
  commission_amount      numeric(14, 2) not null default 0, -- comissão cobrada
  commission_subsidy     numeric(14, 2) not null default 0, -- subsídio comissão
  b2p_delivery           numeric(14, 2) not null default 0, -- logística cobrada pela plataforma
  pay_commission         numeric(14, 2) not null default 0, -- taxa de canal de pagamento
  min_value_diff         numeric(14, 2) not null default 0, -- diferença pedido mínimo
  order_amount           numeric(14, 2) not null default 0, -- valor final do pedido
  cash_balance           numeric(14, 2) not null default 0, -- dinheiro recebido (cash)
  meal_voucher           numeric(14, 2) not null default 0, -- VR (vale-refeição)
  settlement_amount      numeric(14, 2) not null default 0, -- ⭐ líquido a repassar
  meal_loss_deduct       numeric(14, 2) not null default 0,
  vat_amount             numeric(14, 2) not null default 0, -- IVA sobre comissões
  merchant_appeal        numeric(14, 2) not null default 0,

  -- Pagamento
  payment_method         integer,
  payment_channel        integer,              -- 212/280 PIX, 150 cartão, 259 VR…
  payment_method_detail  integer,
  card_brand             text,

  -- Cancelamento
  cancel_ts        bigint,
  cancel_datetime  text,
  cancel_reason    integer,

  -- Repasse
  expect_settle_date  date,
  day_payment_id      text,

  -- Referência da loja/entidade (da própria linha)
  shop_id         text,
  shop_name       text,
  contractor_id   text,
  contractor_name text,
  city_id         text,
  city_name       text,

  -- Tudo cru (inclui monthlyService*, gmv etc. quando vierem)
  raw         jsonb,

  synced_at   timestamptz not null default now(),

  unique (unit_id, order_id, order_type)
);

create index ninefood_bill_unit_data_idx
  on public.ninefood_bill (unit_id, data);

create index ninefood_bill_unit_periodo_idx
  on public.ninefood_bill (unit_id, ref_year, ref_month);

create index ninefood_bill_settle_idx
  on public.ninefood_bill (unit_id, expect_settle_date);

alter table public.ninefood_bill enable row level security;

create policy "ninefood_bill_select_with_access"
  on public.ninefood_bill for select
  using (public.has_unit_access(unit_id));

comment on table public.ninefood_bill is
  '99 Food — extrato financeiro por pedido (Financial API getShopBillDetail). Valores em R$. Fonte automática, paralela ao import manual.';
