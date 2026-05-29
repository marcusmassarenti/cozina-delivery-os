-- 0016_keeta.sql
-- Keeta — 3ª plataforma de delivery. Espelha a estrutura do 99 Food.
-- Relatórios suportados (Fase 1):
--   A) "Loja diária"  → keeta_daily_loja   (1 linha por unit × dia)
--   D) "Itens diário" → keeta_daily_item   (1 linha por item × dia)
--   C) "Pedidos"      → keeta_pedidos       (1 linha por pedido; financeiro +
--                                            cancelamento + avaliação)
--
-- A loja é identificada no XLSX por "ID do restaurante" → casa com
-- unit_platforms.external_store_id (platform = 'keeta', já permitido na 0002).


-- 1) Loja diária (agregado operacional + funil) ----------------------

create table public.keeta_daily_loja (
  id                          uuid primary key default uuid_generate_v4(),
  unit_id                     uuid not null references public.units(id) on delete cascade,

  data                        date not null,
  ref_year                    integer not null,
  ref_month                   integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Vendas
  vendas_itens                numeric(14, 2) not null default 0,  -- "Vendas de itens" (bruto)
  pedidos_validos             integer not null default 0,         -- "Pedidos válidos"
  total_pedidos               integer not null default 0,         -- "Total de pedidos"
  pedidos_cancelados          integer not null default 0,         -- "Pedidos cancelados"
  valor_medio_pedido          numeric(14, 2) not null default 0,  -- "Valor médio do pedido"

  -- Funil
  alcance_clientes            integer,                            -- "Alcance de clientes"
  visitantes                  integer,                            -- "Visitantes da loja"
  add_carrinho                integer,                            -- "Clientes que adicionaram ao carrinho"
  clientes_finalizados        integer,                            -- "Clientes com compras finalizadas"
  taxa_conv_exposicao_visita  numeric(8, 4),                      -- "Taxa de conversão de exposição em visita"
  taxa_conv_visita_carrinho   numeric(8, 4),                      -- "Taxa de conversão de visita em adição ao carrinho"

  -- Promoções / operação
  vendas_promocao             numeric(14, 2),                     -- "Vendas de promoção de itens"
  num_campanhas               integer,                            -- "Número de campanhas"
  despesa_unidade             numeric(14, 2),                     -- "Despesa (unidade)"
  tempo_aberto_h              numeric(8, 2),                      -- "Tempo aberto (h)"
  tempo_preparo_min           numeric(8, 2),                      -- "Tempo de preparo"

  import_id                   uuid references public.platform_imports(id) on delete set null,
  imported_at                 timestamptz not null default now(),

  unique (unit_id, data)
);

create index keeta_daily_loja_unit_data_idx
  on public.keeta_daily_loja (unit_id, data);
create index keeta_daily_loja_unit_periodo_idx
  on public.keeta_daily_loja (unit_id, ref_year, ref_month);

alter table public.keeta_daily_loja enable row level security;

create policy "keeta_daily_loja_select_with_access"
  on public.keeta_daily_loja for select
  using (public.has_unit_access(unit_id));

comment on table public.keeta_daily_loja is
  'Keeta — "Loja diária" agregada. 1 linha por (unit, data).';


-- 2) Itens diário (cardápio) -----------------------------------------

create table public.keeta_daily_item (
  id                uuid primary key default uuid_generate_v4(),
  unit_id           uuid not null references public.units(id) on delete cascade,

  data              date not null,
  ref_year          integer not null,
  ref_month         integer not null check (ref_month >= 1 and ref_month <= 12),

  item_id           text,                              -- "ID do item"
  nome_item         text not null,                     -- "Nome do item"
  qtd_vendida       numeric(14, 2) not null default 0, -- "Vendas" (quantidade)
  preco_medio       numeric(14, 2) not null default 0, -- "Preço médio do item"
  alcance           integer,                           -- "Alcance de clientes"
  add_carrinho      integer,                           -- "Clientes que adicionaram ao carrinho"
  carrinho_pct      numeric(8, 4),                     -- "Carrinho (%)"

  import_id         uuid references public.platform_imports(id) on delete set null,
  imported_at       timestamptz not null default now(),

  unique (unit_id, data, nome_item)
);

create index keeta_daily_item_unit_data_idx
  on public.keeta_daily_item (unit_id, data);

alter table public.keeta_daily_item enable row level security;

create policy "keeta_daily_item_select_with_access"
  on public.keeta_daily_item for select
  using (public.has_unit_access(unit_id));

comment on table public.keeta_daily_item is
  'Keeta — "Itens diário". 1 linha por (unit, data, item). Receita = qtd_vendida * preco_medio.';


-- 3) Pedidos (financeiro + cancelamento + avaliação) -----------------

create table public.keeta_pedidos (
  id                    uuid primary key default uuid_generate_v4(),
  unit_id               uuid not null references public.units(id) on delete cascade,

  data                  date not null,                  -- "Data" (YYYYMMDD)
  ref_year              integer not null,
  ref_month             integer not null check (ref_month >= 1 and ref_month <= 12),

  pedido_id             text not null,                  -- "ID do pedido"
  tipo_pedido           text,                           -- "Tipo de pedido"
  horario_pedido        timestamptz,                    -- "Horário do pedido"
  horario_conclusao     timestamptz,                    -- "Horário da conclusão"
  status_pedido         text,                           -- "Status do pedido" (Concluído/Cancelado)
  tipo_cancelamento     text,                           -- "Tipo de cancelamento"
  motivo_cancelamento   text,                           -- "Motivo do cancelamento do pedido"

  -- Financeiro
  ganhos_liquidos       numeric(14, 2),                 -- "Ganhos líquidos" (net pra loja)
  vendas_itens          numeric(14, 2),                 -- "Vendas de itens" (bruto)
  outros_ganhos         numeric(14, 2),                 -- "Outros ganhos"
  despesa               numeric(14, 2),                 -- "Despesa"
  despesas_plataforma   numeric(14, 2),                 -- "Despesas da plataforma"
  comissao              numeric(14, 2),                 -- "Comissão"
  outras_despesas       numeric(14, 2),                 -- "Outras despesas"
  taxa_entrega          numeric(14, 2),                 -- "Taxa de entrega"

  detalhe_item          text,                           -- "Detalhe do item"
  tempo_preparo_min     numeric(8, 2),                  -- "Tempo de preparo (min)"

  -- Avaliação
  data_avaliacao        date,                           -- "Data da avaliação"
  pontuacao_avaliacao   integer,                        -- "Pontuação da avaliação" (1..5)
  conteudo_avaliacao    text,                           -- "Conteúdo da avaliação"
  resposta_avaliacao    text,                           -- "Resposta da avaliação"

  import_id             uuid references public.platform_imports(id) on delete set null,
  imported_at           timestamptz not null default now(),

  unique (unit_id, pedido_id)
);

create index keeta_pedidos_unit_data_idx
  on public.keeta_pedidos (unit_id, data);
create index keeta_pedidos_unit_periodo_idx
  on public.keeta_pedidos (unit_id, ref_year, ref_month);
create index keeta_pedidos_unit_avaliacao_idx
  on public.keeta_pedidos (unit_id, data_avaliacao);

alter table public.keeta_pedidos enable row level security;

create policy "keeta_pedidos_select_with_access"
  on public.keeta_pedidos for select
  using (public.has_unit_access(unit_id));

comment on table public.keeta_pedidos is
  'Keeta — "Pedidos". 1 linha por pedido: financeiro, cancelamento e avaliação.';
