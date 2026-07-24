-- Pagamento do pedido iFood vindo da API (Financial Events).
--
-- POR QUÊ: o "Relatório de pedidos (VR)" é hoje o último relatório iFood que a
-- operação sobe à mão, 1 arquivo POR LOJA. O endpoint Financial Events
-- (GET /financial/v3.0/merchants/{id}/financial-events) já é chamado todo dia
-- pelo cron — e o retorno era descartado sem gravar nada. Ele traz, no evento
-- ORDER_PAYMENT: payment.method, payment.brand e amount.value por pedido.
--
-- PROVA (loja JK, jun/2026, comparando a MESMA janela do arquivo manual):
--   Crédito 894→889 · Carteira 581→586 · Vale-Refeição 570→572 · PIX 355→356
--   Outros 133→134 · Débito 46→47   (2.579 manual vs 2.584 API = 99,8%)
--   VR por bandeira bateu exato: ALELO 179=179, SODEXO 101=101, TICKET 60=60,
--   "IFOOD + Outros vales" 123=123.
--   amount.value == total_pago_cliente ao CENTAVO em 11/12 pedidos amostrados
--   (o 12º era cancelado: a API já devolve 0,00, refletindo o estorno).
-- De quebra, no mês cheio a API deu 2.832 pedidos — o MESMO que a conciliação
-- — enquanto o arquivo manual tinha 2.579: faltavam 29 e 30/jun inteiros.
--
-- DECISÃO: reusar a tabela `ifood_pedidos` em vez de criar outra, igual foi
-- feito nas avaliações. Assim TODOS os consumidores (mix de pagamento, VR do
-- DRE, fechamento semanal) seguem funcionando sem alteração, e a chave única
-- (unit_id, pedido_id) deduplica API × planilha sozinha.
--
-- ⚠️ REGRA DE ESCRITA (lição que já custou caro nas avaliações): o sync da API
-- grava SOMENTE as colunas que ele conhece. As colunas que só a planilha tem
-- (valor_itens, valor_liquido, turno, incentivos, taxas, tipo_entrega,
-- produto_logistico, canal_venda…) NÃO entram no payload do upsert — senão um
-- sync passaria por cima do dado do import com NULL.

-- Origem da linha: 'report' = planilha do portal · 'api' = Financial Events.
alter table public.ifood_pedidos
  add column if not exists source text not null default 'report';

alter table public.ifood_pedidos
  drop constraint if exists ifood_pedidos_source_check;
alter table public.ifood_pedidos
  add constraint ifood_pedidos_source_check
  check (source in ('report', 'api'));

-- Bandeira crua do meio de pagamento (VISA, MASTERCARD, NUBANK, ALELO, VR,
-- SODEXO, TICKET, IFOOD_MEAL_VOUCHER…). A planilha só trazia isso embutido no
-- texto de `forma_pagamento`; a API entrega o campo separado — e com mais
-- granularidade que o relatório (que junta os vales do iFood em "Outros").
alter table public.ifood_pedidos
  add column if not exists bandeira text;

-- Data/hora em que a linha foi sincronizada pela API (NULL nas de planilha).
alter table public.ifood_pedidos
  add column if not exists synced_at timestamptz;

comment on column public.ifood_pedidos.source is
  'Origem da linha: report (planilha do portal) ou api (Financial Events).';
comment on column public.ifood_pedidos.bandeira is
  'Bandeira crua do pagamento (VISA/MASTERCARD/ALELO/SODEXO/IFOOD_MEAL_VOUCHER…). Só a API preenche.';
comment on column public.ifood_pedidos.synced_at is
  'Quando a API sincronizou esta linha. NULL = veio de planilha.';

comment on table public.ifood_pedidos is
  'iFood — pedidos (1 linha/pedido). Forma de pagamento/VR por bandeira. Alimentada pela API (Financial Events) e/ou pela planilha do portal, deduplicadas por (unit_id, pedido_id). NÃO entra no faturamento bruto/líquido (que vem da conciliação).';

-- Consulta típica do mix: "pagamentos da loja X no mês Y por grupo".
create index if not exists ifood_pedidos_unit_periodo_grupo_idx
  on public.ifood_pedidos (unit_id, ref_year, ref_month, forma_grupo);
