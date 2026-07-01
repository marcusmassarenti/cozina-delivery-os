-- 99Food descontinuou o campo legado pay_type. O detalhe da forma de pagamento
-- agora vem em pay_channel (150=cartão, 212/280=PIX, 259=VR, 153=dinheiro…),
-- combinado com pay_method (1=online / 2=dinheiro). O webhook orderNew já manda
-- pay_channel — passamos a guardar pra traduzir o "1"/"2" cru em rótulos
-- amigáveis no relatório de pedidos.

alter table public.ninefood_pedidos
  add column if not exists pay_channel integer;

comment on column public.ninefood_pedidos.pay_channel is
  '99Food pay_channel do webhook orderNew (150 cartão, 212/280 PIX, 259 VR, 153 dinheiro). NULL em pedidos vindos de import manual.';

-- Backfill dos pedidos que já entraram via webhook (match por order_id = pedido_id).
update public.ninefood_pedidos p
set pay_channel = (w.payload -> 'data' -> 'order_info' ->> 'pay_channel')::int
from public.ninefood_webhook_events w
where w.event_type = 'orderNew'
  and coalesce(
        w.payload -> 'data' ->> 'order_id',
        w.payload -> 'data' -> 'order_info' ->> 'order_id'
      ) = p.pedido_id
  and (w.payload -> 'data' -> 'order_info' ->> 'pay_channel') ~ '^[0-9]+$'
  and p.pay_channel is null;
