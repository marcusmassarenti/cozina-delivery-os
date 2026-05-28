--------------------------------------------------------------------
-- 0015_ninefood_pedidos.sql
-- 99 Food — "Dados do pedido": 1 linha = 1 pedido.
--
-- Granularidade máxima do 99 Food. Cobre 3 áreas:
--   - Financeiro por pedido (valores, taxas, comissões)
--   - Cliente (id + qtd pedidos anteriores → novo vs recorrente)
--   - Avaliação (nota + comentário + tag) ← equivalente avaliações iFood
--   - Logística (tempos detalhados)
--   - Cancelamento (motivo + parte responsável)
--
-- Idempotência via UNIQUE (unit_id, pedido_id) — reimportar substitui.
--------------------------------------------------------------------

create table public.ninefood_pedidos (
  id                                  uuid primary key default uuid_generate_v4(),
  unit_id                             uuid not null references public.units(id) on delete cascade,

  -- Identificadores
  pedido_id                           text not null,        -- "5764671941520722620"
  data                                date not null,        -- 2026-05-27 (de "Data" YYYYMMDD)
  ref_year                            integer not null,
  ref_month                           integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Horários
  horario_pedido                      timestamptz,
  horario_conclusao                   timestamptz,
  horario_cancelamento                timestamptz,
  tempo_pos_venda                     text,                 -- vem string no XLSX, mantemos cru

  -- Valores (mesmas semânticas do "Dados da loja", mas por pedido)
  receita_vendas                      numeric(14, 2),       -- "Receita de vendas"
  preco_original_item                 numeric(14, 2),
  receita_real_loja                   numeric(14, 2),
  despesas_ofertas                    numeric(14, 2),
  despesas_comissao                   numeric(14, 2),
  taxa_canal_pagamento                numeric(14, 2),
  recompensas_plataforma              numeric(14, 2),
  gorjeta                             numeric(14, 2),
  contagem_item                       integer,              -- qtd de itens no pedido
  taxa_entrega_original               numeric(14, 2),
  taxa_entrega_novos_clientes         numeric(14, 2),

  -- Cliente (único do 99 Food)
  cliente_id                          text,
  qtd_pedidos_anteriores_cliente      integer,              -- 0 = novo

  -- Cancelamento / Reembolso
  valor_reembolso                     numeric(14, 2),
  custo_loja_oferta_entrega_gratis    numeric(14, 2),
  custos_logisticos                   numeric(14, 2),
  parte_responsavel_cancelamento      text,                 -- "Comerciante" | "Plataforma" | null
  motivos_cancelamento_comerciante    text,

  -- Operação
  tempo_preparo_min                   numeric(8, 2),        -- decimal pra preservar 12.08
  clicou_pronto_retirada              boolean,
  forma_pagamento                     text,
  metodo_entrega                      text,
  preparacao_atrasada                 boolean,

  -- Tempos (em segundos)
  tempo_aceitacao_seg                 integer,
  tempo_finalizacao_seg               integer,
  duracao_entrega_seg                 integer,
  tempo_confirmacao_entregador_seg    integer,
  tempo_entregador_chegada_loja_seg   integer,
  tempo_pedido_pronto_chegada_seg     integer,
  tempo_espera_retirada_seg           integer,
  tempo_entregador_cliente_seg        integer,
  tempo_espera_cliente_seg            integer,

  -- Avaliação (a estrela do relatório)
  data_avaliacao                      date,
  nivel_avaliacao                     smallint check (nivel_avaliacao is null or (nivel_avaliacao >= 1 and nivel_avaliacao <= 5)),
  conteudo_avaliacao                  text,                 -- comentário do cliente
  tag_avaliacao                       text,                 -- tags (texto livre, separadas por vírgula)

  -- Audit
  import_id                           uuid references public.platform_imports(id) on delete set null,
  imported_at                         timestamptz not null default now(),

  unique (unit_id, pedido_id)
);

create index ninefood_pedidos_unit_data_idx
  on public.ninefood_pedidos (unit_id, data);

create index ninefood_pedidos_unit_periodo_idx
  on public.ninefood_pedidos (unit_id, ref_year, ref_month);

create index ninefood_pedidos_avaliacao_idx
  on public.ninefood_pedidos (unit_id, data_avaliacao)
  where data_avaliacao is not null;

create index ninefood_pedidos_cliente_idx
  on public.ninefood_pedidos (unit_id, cliente_id)
  where cliente_id is not null;

alter table public.ninefood_pedidos enable row level security;

create policy "ninefood_pedidos_select_with_access"
  on public.ninefood_pedidos for select
  using (public.has_unit_access(unit_id));

comment on table public.ninefood_pedidos is
  '99 Food — "Dados do pedido". 1 linha = 1 pedido. Inclui avaliações, dados de cliente, logística e financeiro por pedido.';
