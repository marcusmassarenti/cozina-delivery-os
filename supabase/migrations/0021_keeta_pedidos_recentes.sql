--------------------------------------------------------------------
-- 0021_keeta_pedidos_recentes.sql
-- Relatório "Pedidos recentes" do Keeta — 1 linha por pedido, com o
-- detalhamento financeiro que o "Dados do pedido" (keeta_pedidos) NÃO traz:
--   - Promoção financiada pela Keeta vs pela loja (quem banca o desconto)
--   - Taxas granulares (comissão básica, distância, saque, pagamento online)
--   - Preço original (tabela) vs valor pago pelo cliente
--   - Tipo de campanha + detalhe de cancelamento (quem cancelou / reembolso)
--
-- Tabela separada da keeta_pedidos (que tem avaliação/tempo de preparo) — os
-- dois relatórios são complementares, não substitutos.
--------------------------------------------------------------------

create table public.keeta_pedidos_recentes (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  numero_pedido            text not null,                 -- "Número do pedido" (id completo)
  numero_pedido_curto      text,                          -- "Número do pedido" (4 dígitos)

  data                     date not null,                 -- dia do "Horário do pedido"
  ref_year                 integer not null,
  ref_month                integer not null check (ref_month >= 1 and ref_month <= 12),

  horario_pedido           timestamptz,                   -- "Horário do pedido"
  horario_conclusao        timestamptz,                   -- "Horário de conclusão"
  horario_cancelamento     timestamptz,                   -- "Horário de cancelamento"
  turno                    text,                          -- derivado do horário (almoco/jantar/...)

  status_pedido            text,                          -- "Status do pedido" (Concluído/Cancelado/Aceito)
  tipo_reembolso           text,                          -- "Tipos de reembolso"
  motivo_cancelamento      text,                          -- "Motivo do cancelamento do pedido"
  quem_cancelou            text,                          -- "Quem cancelou"
  responsabilidade         text,                          -- "Responsabilidade"
  motivo_decisao           text,                          -- "Motivo da decisão"

  itens                    text,                          -- "Itens" (lista crua)
  tipo_campanha            text,                          -- "Tipo de campanha"

  -- Financeiro (R$) — sinais como no relatório (taxas vêm negativas)
  ganhos                   numeric(14, 2),                -- "Ganhos" (líquido pra loja)
  valor_pago_cliente       numeric(14, 2),                -- "Valor pago pelo cliente"
  preco_original           numeric(14, 2),                -- "Preço original" (tabela)
  ressarcimento_plataforma numeric(14, 2),                -- "Ressarcimento da plataforma"

  comissao_basica          numeric(14, 2),                -- "Comissão básica"
  taxa_distancia           numeric(14, 2),                -- "Taxa adicional de distância"
  taxa_saque_antecipado    numeric(14, 2),                -- "Taxa de saque antecipado"
  taxa_pagamento_online    numeric(14, 2),                -- "Taxa de pagamento online"
  diferenca_paga           numeric(14, 2),                -- "Diferença paga"

  desconto_keeta           numeric(14, 2),                -- "Desconto da Keeta"
  promo_keeta              numeric(14, 2),                -- "Promoção financiada pela Keeta"
  promo_loja               numeric(14, 2),                -- "Promoção financiada pela loja"

  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, numero_pedido)
);

create index keeta_ped_rec_unit_ref_idx
  on public.keeta_pedidos_recentes (unit_id, ref_year, ref_month);

alter table public.keeta_pedidos_recentes enable row level security;

create policy "keeta_ped_rec_select_with_access"
  on public.keeta_pedidos_recentes for select
  using (public.has_unit_access(unit_id));
