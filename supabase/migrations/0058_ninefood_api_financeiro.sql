--------------------------------------------------------------------
-- 0058_ninefood_api_financeiro.sql
--
-- Persistência do financeiro do 99 puxado VIA API (Financial API / Bill Data),
-- pra eliminar o import manual de planilha.
--
-- 1) ninefood_store_links: liga cada loja 99 (app_shop_id) a uma unidade nossa.
-- 2) ninefood_api_bill: extrato financeiro pedido-a-pedido (getShopBillDetail).
--    Valores em REAIS (a API dá centavos; o sync divide por 100). Guarda os
--    campos-chave + o `raw` completo pra qualquer análise futura.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

-- 1) Liga loja 99 → unidade --------------------------------------------------
create table if not exists public.ninefood_store_links (
  app_shop_id text primary key,             -- o APPshopID definido no portal 99
  unit_id     uuid references public.units(id),
  id_loja     text,                          -- ID do loja no 99 (informativo)
  name        text,                          -- nome do estabelecimento no 99
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.ninefood_store_links enable row level security;

-- Pré-popula as 3 lojas já vinculadas no portal.
-- ⚠️ CONFIRA o mapeamento (sobretudo VNC → JK) antes/depois de rodar.
insert into public.ninefood_store_links (app_shop_id, unit_id, id_loja, name) values
  ('cozina-jardins-01', (select id from public.units where code = '04'), '5764609194175758749', 'Churrasco no Pote - Jardins'),
  ('cozina-sjc-01',     (select id from public.units where code = '09'), '5764612793391908651', 'Churrasco no Pote - Sao Jose dos Campos'),
  ('cozina-vnc-01',     (select id from public.units where code = '01'), '5764608480040976980', 'Churrasco no Pote - Vila Nova Conceicao')
on conflict (app_shop_id) do nothing;

-- 2) Extrato financeiro pedido-a-pedido (Bill Data) --------------------------
create table if not exists public.ninefood_api_bill (
  id                    bigint generated always as identity primary key,
  app_shop_id           text not null,
  order_id              text not null,
  order_index           text,
  order_type            int  not null,        -- 1 receita · 2 reemb · 3 reemb parcial · 4 pós-venda · 5 taxa
  business_date         date,                 -- data do pedido (BRT)
  business_ts           bigint,
  expect_settle_date    date,                 -- data prevista de repasse (FILTRO da API)
  day_payment_id        text,                 -- lote de repasse
  meal_original_amount  numeric not null default 0,  -- valor do pedido (R$)
  pay_commission_amount numeric not null default 0,  -- comissão/taxa 99 (R$, ~negativo)
  shop_delivery_amount  numeric not null default 0,
  settlement_amount     numeric not null default 0,  -- ⭐ líquido a repassar (R$)
  payment_method        int,
  raw                   jsonb,
  synced_at             timestamptz not null default now()
);

-- dedupe/upsert: um lançamento por (loja, pedido, tipo)
create unique index if not exists ninefood_api_bill_uniq
  on public.ninefood_api_bill (app_shop_id, order_id, order_type);

-- leitura: por loja e por data (repasse e pedido)
create index if not exists ninefood_api_bill_shop_settle
  on public.ninefood_api_bill (app_shop_id, expect_settle_date);
create index if not exists ninefood_api_bill_shop_business
  on public.ninefood_api_bill (app_shop_id, business_date);

alter table public.ninefood_api_bill enable row level security;
