-- 0017_ifood_pedidos
-- iFood — "Relatório de pedidos" (1 linha por pedido). Fonte de FORMA DE
-- PAGAMENTO / VR por bandeira + detalhe operacional do pedido.
--
-- IMPORTANTE: NÃO entra no faturamento bruto/líquido (que continua vindo da
-- conciliação financeira). Esta tabela é usada só pra pagamento/VR/operação.

create table public.ifood_pedidos (
  id                    uuid primary key default uuid_generate_v4(),
  unit_id               uuid not null references public.units(id) on delete cascade,

  pedido_id             text not null,                  -- "ID COMPLETO DO PEDIDO"
  pedido_id_curto       text,                           -- "ID CURTO DO PEDIDO"
  data                  date not null,                  -- data do pedido (YYYY-MM-DD)
  horario              timestamptz,                     -- "DATA E HORA DO PEDIDO"
  ref_year              integer not null,
  ref_month             integer not null check (ref_month >= 1 and ref_month <= 12),

  turno                 text,                            -- "TURNO" (ALMOCO/JANTAR/...)
  status_final          text,                            -- "STATUS FINAL DO PEDIDO"

  -- Valores (R$)
  valor_itens           numeric(14, 2),                  -- "VALOR DOS ITENS (R$)"
  total_pago_cliente    numeric(14, 2),                  -- "TOTAL PAGO PELO CLIENTE (R$)"
  taxa_entrega_cliente  numeric(14, 2),                  -- "TAXA DE ENTREGA PAGA PELO CLIENTE (R$)"
  incentivo_ifood       numeric(14, 2),                  -- "INCENTIVO PROMOCIONAL DO IFOOD (R$)"
  incentivo_loja        numeric(14, 2),                  -- "INCENTIVO PROMOCIONAL DA LOJA (R$)"
  incentivo_rede        numeric(14, 2),                  -- "INCENTIVO PROMOCIONAL DA REDE (R$)"
  taxa_servico          numeric(14, 2),                  -- "TAXA DE SERVIÇO (R$)"
  taxas_comissoes       numeric(14, 2),                  -- "TAXAS E COMISSOES (R$)"
  valor_liquido         numeric(14, 2),                  -- "VALOR LIQUIDO (R$)"

  -- Pagamento
  forma_pagamento       text,                            -- "FORMA DE PAGAMENTO" (texto cru)
  forma_grupo           text,                            -- Crédito/PIX/Carteira/Débito/Vale-Refeição/Outros
  bandeira_vr           text,                            -- SODEXO/ALELO/VR/TICKET/IFOOD/OUTROS (quando VR)

  tipo_entrega          text,                            -- "TIPO DE ENTREGA"
  produto_logistico     text,                            -- "PRODUTO LOGISTICO"
  canal_venda           text,                            -- "CANAL DE VENDA"

  import_id             uuid references public.platform_imports(id) on delete set null,
  imported_at           timestamptz not null default now(),

  unique (unit_id, pedido_id)
);

create index ifood_pedidos_unit_data_idx
  on public.ifood_pedidos (unit_id, data);
create index ifood_pedidos_unit_periodo_idx
  on public.ifood_pedidos (unit_id, ref_year, ref_month);
create index ifood_pedidos_vr_idx
  on public.ifood_pedidos (unit_id, ref_year, ref_month, bandeira_vr);

alter table public.ifood_pedidos enable row level security;

create policy "ifood_pedidos_select_with_access"
  on public.ifood_pedidos for select
  using (public.has_unit_access(unit_id));

comment on table public.ifood_pedidos is
  'iFood — relatório de pedidos (1 linha/pedido). Forma de pagamento/VR por bandeira + detalhe. NÃO entra no faturamento (vem da conciliação).';
