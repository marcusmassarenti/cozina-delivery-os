-- A promoção de cada item vendido no 99: quanto o cliente viu de desconto e
-- quanto a LOJA bancou.
--
-- ── POR QUE ──────────────────────────────────────────────────────────────
-- O webhook `orderNew` sempre mandou isso dentro de cada item:
--
--   "promotion_detail": { "promo_type": 2, "promo_discount": 1796,
--                         "shop_subside_price": 1437 }
--
-- R$ 17,96 de desconto naquele item, R$ 14,37 bancados pela loja. A extração
-- lia nome, quantidade e preço e descartava o resto. Só no que já está
-- guardado são R$ 75.368,90 de promoção da loja, item a item, parada no banco
-- sem ninguém ler — em 59% dos itens vendidos sai promoção.
--
-- Isso importa porque a promoção bancada pela loja é a SEGUNDA maior sangria
-- da operação (medido em 24/08/26: R$ 8,90 de cada R$ 100, atrás só da
-- comissão) e é a única que o lojista escolhe. Até agora ele só via o total do
-- mês; com isto passa a ver POR PRATO — qual item está comprando a própria
-- venda.
--
-- Em REAIS, como o resto da tabela (a 99 manda centavos).
alter table public.ninefood_pedido_itens
  add column if not exists promo_desconto numeric(12,2),
  add column if not exists promo_loja numeric(12,2);

comment on column public.ninefood_pedido_itens.promo_desconto is
  'Desconto que o CLIENTE viu neste item (promo_discount da 99), em reais.';
comment on column public.ninefood_pedido_itens.promo_loja is
  'Parte do desconto que a LOJA bancou (shop_subside_price da 99), em reais. O resto e subsidio da plataforma.';
