-- 99: o bruto passa a ser a "Renda total das vendas" do portal — e cancelados
-- saem da soma. Com isso a tela do Delivery OS bate AO CENTAVO com a tela do 99.
--
-- ── O QUE ESTAVA ERRADO (Pinheiros / Churrasco no Pote, ago/26) ───────────
-- A tela do 99 mostra "Renda total das vendas R$ 7.881,95", "Ganhos esperados
-- da loja R$ 5.972,61", "Taxa de ganhos 75,78%", "150 vendas". O painel
-- mostrava R$ 9.004,30 de bruto e 66,8% — a loja parecia ficar com MENOS do
-- que fica. Diego (DG FOODS) pegou.
--
-- Duas causas, medidas pedido a pedido (03/09/26):
--
-- 1. `commissionBaseAmount` NAO e a renda: e a BASE DE COMISSAO — o preco de
--    tabela menos a promocao da loja, ANTES do frete gratis que a loja banca.
--    A renda que o portal mostra ja abate esse frete (liquido do que o 99
--    subsidiou de volta):
--
--      mealOriginalAmount          9.134,90   preco de tabela
--      + shopActivityOutcome        -195,00   promocao da loja
--      = commissionBaseAmount      8.939,90   <- o bruto ANTIGO
--      + freeDeliveryOutcome     -1.307,91   frete gratis bancado pela loja
--      + freeDeliverySubsidy       +249,96   parte devolvida pelo 99
--      = RENDA TOTAL DAS VENDAS   7.881,95   <- portal, EXATO (bruto NOVO)
--      - commissionAmount          -796,44   comissao
--      - payCommissionAmount       -257,90   taxa de pagamento
--      - b2pDeliveryAmount         -855,00   entrega feita pelo 99
--      = orderAmount              5.972,61   <- portal "Ganhos esperados", EXATO
--      - mealVoucherAmount         -731,14   vale-refeicao (outro canal)
--      = settlementAmount         5.241,47   o que cai na conta
--
--    E 5.972,61 / 7.881,95 = 75,78% — a "Taxa de ganhos" do portal, exata.
--    Sobre 520 dias em que planilha e API coexistem, o `bruto` da planilha
--    bate com a RENDA em 244 dias e com a base de comissao em 51: a regua do
--    portal tambem e a regua da planilha quando a planilha presta.
--
-- 2. Cancelado entrava pela metade. O pedido cancelado gera DUAS linhas: a
--    original (order_type=1, cancelTs>0, +R$ 39,19) e o estorno (order_type=2,
--    -R$ 39,19). O filtro `order_type = 1` pegava a original e jogava o estorno
--    fora: +R$ 39,19 de liquido e +R$ 64,40 de bruto que nao existem. Na rede,
--    102 estornos em ago/26 (todos negativos ou zero, todos com par tipo 1 do
--    mesmo orderId) = -R$ 4.006 de bruto ignorados. O portal conta "150
--    vendas" = order_type=1 E nao cancelado — e a soma dessas 150 linhas e
--    exatamente os R$ 5.972,61. Regra: dinheiro so de linha nao cancelada;
--    cancelado so na contagem `cancelados`.
--
-- ── O QUE MAIS MUDA ───────────────────────────────────────────────────────
-- • `entrega` (novo): -b2pDeliveryAmount, a entrega feita pelo 99 cobrada da
--   loja. Sem ela o DRE nao fechava e mostrava "Diferenca nao explicada pelas
--   taxas -R$ 1.675,92 (18,6%)". Com bruto=renda e a linha de entrega, a
--   diferenca da Pinheiros e ZERO: 7.881,95 - 796,44 - 257,90 - 855,00 =
--   5.972,61.
-- • `frete_gratis_loja` (novo, informativo): o frete gratis liquido que a loja
--   bancou. JA ESTA ABATIDO do bruto — nao subtrair de novo. Existe pra tela
--   poder dizer "voce deu R$ X de frete gratis" sem refazer a conta.
-- • `entrega_propria` (novo): shopDeliveryAmount, o frete que a loja cobrou
--   quando ela mesma entregou. ENTRA NO BRUTO. Pinheiros tem zero (o 99
--   entrega); a Marmitex Faisao (Tech) tem R$ 9.151 em ago/26. Sem ele, o
--   bruto da Faisao (24.431,81) ficava ABAIXO do ganho (orderAmount
--   27.065,40) — impossivel — e a trava de plausibilidade derrubava o liquido
--   pra derivacao: 44% numa loja que fica com ~86% (confirmado pelo dono,
--   memoria de 24/08/26). Com o frete proprio: 33.582,78 de bruto, 80,6%.
--   Tambem sai como coluna propria pra tela poder dizer "R$ X de frete voce
--   mesmo cobrou".
-- • `pedidos` nao conta stub: 110 linhas em ago/26 chegam sem `orderAmount`
--   (payment_method nulo), valem zero mas inflavam a contagem.
--
-- ── O QUE ESTA PROVADO E O QUE NAO ────────────────────────────────────────
-- PROVADO ao centavo contra o portal: loja em que o 99 entrega (Pinheiros:
-- b2pDeliveryAmount>0, shopDeliveryAmount=0). Bruto, liquido, % e contagem.
--
-- NAO PROVADO (plausivel, nao exato): loja com ENTREGA PROPRIA. Na Faisao a
-- cascata nao fecha linha a linha (347/865 fecham com o frete proprio, 41 sem,
-- 477 com nenhum dos dois) — ha campo ou regra que a Pinheiros nao exercita
-- (`shopActivitySubsidy` +1.288,67 e um candidato). O DRE dela vai mostrar
-- "Diferenca nao explicada" de ~R$ 2.252 (6,7%). Fechar isso precisa de 1
-- print do portal do 99 da Marmitex Faisao (Tech Assessoria), ago/26: com
-- "Renda total" e "Ganhos esperados" na mao a identidade sai em minutos.
--
-- Muda o tipo de retorno (colunas novas), e `create or replace` nao aceita
-- isso: drop + create. So service_role executa, e os 2 chamadores (resumo e
-- e-mail de conexao) leem por nome de coluna.
drop function if exists public.ninefood_api_diario(uuid[], date, date);

create function public.ninefood_api_diario(
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
  entrega_propria numeric
)
language sql
stable
set search_path = public
as $$
  select
    sl.unit_id,
    b.business_date::date as dia,
    -- "Total de vendas realizadas": nao cancelado, e linha de verdade (stub
    -- sem orderAmount nao e pedido).
    count(*) filter (
      where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0
        and b.raw ? 'orderAmount'
    )::int as pedidos,
    -- "Renda total das vendas": base de comissao menos o frete gratis liquido
    -- que a loja bancou, mais o frete que a loja cobrou na entrega propria.
    -- Ver a cascata e o "provado / nao provado" no cabecalho.
    coalesce(sum(
      (b.raw->>'commissionBaseAmount')::numeric
      + coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0)
      + coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
      + coalesce((b.raw->>'shopDeliveryAmount')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as bruto,
    -- "Ganhos esperados da loja".
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
    -- Entrega feita pelo 99, cobrada da loja (debito, chega negativo).
    -coalesce(sum((b.raw->>'b2pDeliveryAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as entrega,
    -- Informativo: ja abatido do bruto. Sai positivo ("a loja deu R$ X").
    -coalesce(sum(
      coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0)
      + coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
    ) filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as frete_gratis_loja,
    -- Informativo: frete cobrado pela loja na entrega propria (credito).
    coalesce(sum((b.raw->>'shopDeliveryAmount')::numeric)
      filter (where coalesce((b.raw->>'cancelTs')::numeric, 0) = 0), 0) / 100 as entrega_propria
  from public.ninefood_api_bill b
  join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
  where sl.unit_id = any(p_unit_ids)
    and b.order_type = 1
    and b.business_date between p_de and p_ate
  group by sl.unit_id, b.business_date::date;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ninefood_api_diario(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_api_diario(uuid[], date, date)
  to service_role;

comment on function public.ninefood_api_diario is
  'Financeiro da API do 99 por loja/dia na regua do PORTAL: bruto = Renda total das vendas (commissionBaseAmount + frete gratis liquido da loja), liquido = orderAmount (Ganhos esperados). So order_type=1 e nao cancelado no dinheiro; cancelado so em `cancelados`. Provado ao centavo na Pinheiros ago/26 (0256).';
