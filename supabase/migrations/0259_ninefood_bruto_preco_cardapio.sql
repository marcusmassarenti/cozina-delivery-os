-- 99: o bruto passa a ser o PREÇO DE CARDÁPIO ("Preço total dos itens sem as
-- ofertas" do painel financeiro do 99). Promoção e frete grátis que a loja
-- bancou viram DESCONTO explícito no DRE, e a conta desce até o líquido.
--
-- ── POR QUE (Duéle Hamburgueria / DG FOODS, 21/09/26) ─────────────────────
-- O cliente abriu o painel financeiro do 99 e viu "mais de R$ 20 mil"; o
-- Delivery OS mostrava R$ 15,8 mil. Não faltava venda: o painel do 99 começa
-- pelo preço de cardápio e desconta as ofertas depois; nós começávamos pela
-- "Renda total" (0256), que já nasce com as ofertas abatidas. Decisão do
-- Marcus: o bruto do 99 é o total, e o DRE vai descontando até o líquido.
--
-- Conferido ao centavo contra 3 prints do painel (semanas de cobrança):
--
--                                   31/08–06/09    07–13/09
--   mealOriginalAmount  (bruto)       2.287,62    10.687,99   ← "Preço total dos itens sem as ofertas"
--   − promo_loja (ofertas líquidas)     472,81     2.536,34   ← "Despesas da loja com ofertas"
--   − frete_gratis_loja                 195,89       933,76   ← "Custos de entrega"
--   = renda (o que o cliente pagou)   1.618,92     7.217,89
--   − comissão / logística / taxa
--   = orderAmount                     1.165,84     5.102,81*  ← "Ganhos totais"
--   (* a semana inclui estornos/reembolso, que o painel mostra à parte)
--
-- `promo_loja` = mealOriginalAmount − commissionBaseAmount. É o que a LOJA
-- bancou de oferta (shopActivityOutcome + shopActivitySubsidy): a parte que o
-- 99 co-financia não sai do bolso da loja. A coluna `promo` (bruta, sem o
-- subsídio) continua existindo por compatibilidade — na Duéle ela dava
-- 6.370,30 onde a loja pagou 5.427,43.
--
-- Identidade: bruto − promo_loja − frete_gratis_loja = renda (a régua 0256).
-- Entrega própria (shopDeliveryAmount) segue somando no bruto e na renda.
--
-- NOME NOVO (_v2) em vez de drop + create: a função antiga segue servindo a
-- versão em produção até o deploy do código novo. Trocar a antiga no lugar
-- mudaria o bruto das telas ANTES do DRE saber descontar as ofertas — e ele
-- mostraria R$ 7 mil de "diferença não explicada". A antiga sai numa
-- migration posterior, quando nada mais a chamar. Só service_role executa.
create or replace function public.ninefood_api_diario_v2(
  p_unit_ids uuid[],
  p_de date,
  p_ate date
)
returns table (
  unit_id uuid,
  dia date,
  pedidos integer,
  bruto numeric,
  liquido numeric,
  comissao numeric,
  taxa_canal numeric,
  promo numeric,
  cancelados integer,
  recebido_direto numeric,
  entrega numeric,
  frete_gratis_loja numeric,
  entrega_propria numeric,
  promo_loja numeric,
  renda numeric
)
language sql
stable
set search_path = public
as $$
  select
    sl.unit_id,
    b.business_date::date as dia,
    count(*) filter (
      where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0
        and b.raw ? 'orderAmount'
    )::int as pedidos,
    -- Preço de cardápio + frete cobrado pela loja na entrega própria.
    coalesce(sum(
      coalesce((b.raw->>'mealOriginalAmount')::numeric, 0)
      + coalesce((b.raw->>'shopDeliveryAmount')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as bruto,
    coalesce(sum((b.raw->>'orderAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as liquido,
    -coalesce(sum((b.raw->>'commissionAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as comissao,
    -coalesce(sum((b.raw->>'payCommissionAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as taxa_canal,
    -coalesce(sum((b.raw->>'shopActivityOutcome')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as promo,
    count(*) filter (
      where coalesce((b.raw->>'cancelTs')::numeric, 0) > 0
    )::int as cancelados,
    coalesce(sum((b.raw->>'orderAmount')::numeric)
      filter (where b.payment_method = 2
                and coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as recebido_direto,
    -coalesce(sum((b.raw->>'b2pDeliveryAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as entrega,
    -coalesce(sum(
      coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0)
      + coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as frete_gratis_loja,
    coalesce(sum((b.raw->>'shopDeliveryAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as entrega_propria,
    -- Oferta que a LOJA bancou (líquida do co-financiamento do 99).
    coalesce(sum(
      coalesce((b.raw->>'mealOriginalAmount')::numeric, 0)
      - coalesce((b.raw->>'commissionBaseAmount')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as promo_loja,
    -- A régua antiga (0256): "Renda total das vendas".
    coalesce(sum(
      (b.raw->>'commissionBaseAmount')::numeric
      + coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0)
      + coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
      + coalesce((b.raw->>'shopDeliveryAmount')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as renda
  from public.ninefood_api_bill b
  join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
  where sl.unit_id = any(p_unit_ids)
    and b.order_type = 1
    and b.business_date between p_de and p_ate
  group by sl.unit_id, b.business_date::date;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ninefood_api_diario_v2(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_api_diario_v2(uuid[], date, date)
  to service_role;

comment on function public.ninefood_api_diario_v2 is
  'Financeiro da API do 99 por loja/dia. bruto = PREÇO DE CARDÁPIO (mealOriginalAmount + frete da entrega própria), igual ao painel financeiro do 99; promo_loja e frete_gratis_loja são os descontos que a loja bancou; renda = bruto − promo_loja − frete_gratis_loja (régua 0256); liquido = orderAmount. Só order_type=1 e não cancelado no dinheiro (0259).';
