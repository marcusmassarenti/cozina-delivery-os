--------------------------------------------------------------------
-- 0014_ninefood_daily.sql
-- 99 Food — duas tabelas espelhando os relatórios da plataforma:
--
--   1) ninefood_daily_loja  ← "Dados da loja"
--      1 linha = 1 unidade x 1 dia, agregado.
--      Equivalente do iFood Financeiro (mas o XLSX já vem agregado,
--      então não precisamos da granularidade de lançamentos).
--
--   2) ninefood_daily_item  ← "Dados do item"
--      1 linha = 1 unidade x 1 dia x 1 item do cardápio.
--      Equivalente do iFood ifood_daily_items.
--
-- Idempotência via UNIQUE (unit_id, data) e (unit_id, data, nome_item).
-- Reimportar o mesmo dia substitui os dados (handled na server action).
--------------------------------------------------------------------

-- 1) Dados da loja (financeiro agregado diário) -------------------

create table public.ninefood_daily_loja (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  -- Período
  data                     date not null,
  ref_year                 integer not null,
  ref_month                integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Vendas (do XLSX "Dados da loja")
  pedidos                  integer not null default 0,    -- "Total de vendas realizadas"
  bruto                    numeric(14, 2) not null default 0, -- "Receita total de vendas"
  liquido                  numeric(14, 2) not null default 0, -- "Receita total" (pós-taxas)
  ticket_medio             numeric(14, 2) not null default 0, -- "Valor médio dos pedidos"

  -- Taxas / descontos
  comissao_rs              numeric(14, 2) not null default 0, -- "Despesas de comissão da loja"
  taxa_canal_pagamento_rs  numeric(14, 2) not null default 0, -- "Taxa de canal de pagamento da loja"
  promocoes_rs             numeric(14, 2) not null default 0, -- "Despesas de ofertas da loja"

  -- Qualidade (opcionais — vêm se Marcus marcar no relatório)
  avaliacao_loja           numeric(3, 2),                  -- "Avaliação da loja" (0.0–5.0)
  taxa_aceitacao_pct       numeric(6, 3),                  -- "Taxa de Aceitação (TA)" (0–100)
  cancelamentos_qtd        integer,                        -- "Cancelamentos por parte do comerciante"
  tempo_medio_preparo_min  integer,                        -- "Tempo médio de preparo (minutos)"

  -- Audit
  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, data)
);

create index ninefood_daily_loja_unit_data_idx
  on public.ninefood_daily_loja (unit_id, data);

create index ninefood_daily_loja_unit_periodo_idx
  on public.ninefood_daily_loja (unit_id, ref_year, ref_month);

alter table public.ninefood_daily_loja enable row level security;

create policy "ninefood_daily_loja_select_with_access"
  on public.ninefood_daily_loja for select
  using (public.has_unit_access(unit_id));

comment on table public.ninefood_daily_loja is
  '99 Food — "Dados da loja" agregado por dia. 1 linha por (unit, data).';


-- 2) Dados do item (cardápio diário) ------------------------------

create table public.ninefood_daily_item (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  data                     date not null,
  nome_item                text not null,

  -- Vendas do item (do XLSX "Dados do item")
  receita                  numeric(14, 2) not null default 0, -- "Receita do item"
  qtd_vendida              integer not null default 0,        -- "Volume de vendas do item"
  preco_medio              numeric(14, 2) not null default 0, -- "Média de preço do item"

  -- Funil (do mesmo XLSX)
  alcance                  integer not null default 0,        -- "Alcance"
  add_carrinho             integer not null default 0,        -- "Clientes que adicionaram ao carrinho"
  conversao_pct            numeric(8, 4),                     -- "Taxa de conversão de adição ao carrinho" (% pode passar 100 — vi 300.00%)

  -- Audit
  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, data, nome_item)
);

create index ninefood_daily_item_unit_data_idx
  on public.ninefood_daily_item (unit_id, data);

alter table public.ninefood_daily_item enable row level security;

create policy "ninefood_daily_item_select_with_access"
  on public.ninefood_daily_item for select
  using (public.has_unit_access(unit_id));

comment on table public.ninefood_daily_item is
  '99 Food — "Dados do item" por (unit, data, item). Espelha ifood_daily_items.';
