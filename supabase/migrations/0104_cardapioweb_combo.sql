--------------------------------------------------------------------
-- 0104_cardapioweb_combo.sql
--
-- Corrige um buraco que só apareceu ao bater na API de verdade: o item do
-- pedido pode CONTER OUTROS ITENS. Quando `kind='combo'`, o payload traz um
-- array `items[]` aninhado dentro do próprio item, e cada sub-item tem
-- nome, quantidade, preço, `external_code` e os próprios complementos.
--
-- Exemplo real do sandbox:
--   "Combo da promoção!" (kind=combo)
--     └─ Calabresa   (external_code 1253)  ← com opções próprias
--     └─ Portuguesa  (external_code  712)
--
-- Sem isso, o "Top produtos" contaria "Combo da promoção!" e perderia as
-- pizzas — e o `external_code` do sub-item, que é a ponte pra ficha técnica
-- e pro CMV por produto, sumiria junto.
--
-- Solução: auto-referência. Item de primeiro nível tem parent_item_id null;
-- sub-item aponta pro pai. Relatório de produto filtra por kind ou soma os
-- dois níveis, conforme a pergunta.
--------------------------------------------------------------------

alter table public.cardapioweb_pedido_itens
  add column if not exists parent_item_id bigint
    references public.cardapioweb_pedido_itens(id) on delete cascade;

create index if not exists cardapioweb_pedido_itens_parent_idx
  on public.cardapioweb_pedido_itens (parent_item_id);

comment on column public.cardapioweb_pedido_itens.parent_item_id is
  'null = item de primeiro nível. Preenchido = sub-item de um combo (kind=combo no pai).';

-- Operador que lançou o item (vem em items[].user). Útil pra pedido de
-- balcão/mesa, onde dá pra ver quem registrou.
alter table public.cardapioweb_pedido_itens
  add column if not exists operador text;

-- Campo que a API devolve mas não está na documentação — guardamos porque
-- é observação interna da loja e some se não capturarmos na hora.
alter table public.cardapioweb_pedidos
  add column if not exists observacao_interna text;
