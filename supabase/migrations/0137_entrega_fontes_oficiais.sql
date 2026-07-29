-- Guarda as fontes OFICIAIS de "quem bancou a entrega" que os importadores
-- vinham descartando. Achados de três auditorias independentes (jul/2026).

-- ── Keeta ────────────────────────────────────────────────────────────
-- A aba "Histórico de pedidos" da fatura traz DUAS colunas distintas —
-- "Subsídios de entrega cobertos pela loja" e "Custos de promoção do item por
-- conta da loja" — e o parser somava as duas em `promo_loja`, destruindo a
-- separação. Sem ela, "quanto a loja bancou de frete" só dava pra reconstruir
-- (Σ taxa_entrega − campanha), fechando a ±2%. Agora é número oficial.
-- `promo_loja` segue sendo o TOTAL; `subsidio_entrega` é o recorte.
alter table public.keeta_fatura_taxas
  add column if not exists subsidio_entrega numeric(12,2) not null default 0;

comment on column public.keeta_fatura_taxas.subsidio_entrega is
  'Coluna "Subsídios de entrega cobertos pela loja" da fatura. Subconjunto de promo_loja (item + entrega) — nunca somar as duas.';

-- ── 99 Food ──────────────────────────────────────────────────────────
-- O webhook `orderNew` manda `store_charged_delivery_price` (frete de tabela)
-- e `delivery_discount` em 100% dos eventos, e o processador jogava os dois
-- fora guardando só o líquido. A identidade
--   delivery_price = store_charged_delivery_price − delivery_discount
-- fecha em 2.441 de 2.441 eventos de julho.
--
-- ⚠️ Nenhum relatório exportável da 99 traz esse dado: a coluna "Taxa de
-- entrega original da loja" da planilha vem 0 em 100% das linhas — provado em
-- 203 pedidos casados em que a API registra frete pago e a planilha traz zero.
-- É o frete de ENTREGA PRÓPRIA, que não existe em entrega da plataforma.
alter table public.ninefood_pedidos
  add column if not exists taxa_entrega_cheia numeric(12,2),
  add column if not exists desconto_entrega numeric(12,2);

comment on column public.ninefood_pedidos.taxa_entrega_cheia is
  'price.store_charged_delivery_price do webhook — frete de tabela antes do desconto. Só nas linhas vindas da API.';
comment on column public.ninefood_pedidos.desconto_entrega is
  'price.delivery_discount do webhook — desconto concedido ao cliente. taxa_entrega_original = cheia − desconto.';
