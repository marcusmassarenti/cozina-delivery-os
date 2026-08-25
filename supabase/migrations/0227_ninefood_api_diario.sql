-- Financeiro da API do 99, agregado por LOJA e por DIA.
--
-- ── POR QUE EXISTE ────────────────────────────────────────────────────────
-- O fallback do 99 (quando nao ha relatorio diario importado) somava linha
-- crua do `ninefood_api_bill` em JS: milhares de linhas descendo pelo
-- PostgREST pra virar meia duzia de totais. E a mesma doenca ja mapeada em
-- outras telas. Aqui o Postgres agrega e devolve no maximo 1 linha por
-- loja/dia.
--
-- ── A DE-PARA (medida, nao suposta) ───────────────────────────────────────
-- Em 24/08/26 casei 263 pedidos da Marmitex Faisao (01→13/ago) entre o
-- relatorio "Dados do pedido" e o extrato da API, pedido a pedido. Bate
-- CENTAVO a centavo:
--
--   planilha `receita_vendas`     == API `commissionBaseAmount`   ← o BRUTO
--   planilha `receita_real_loja`  == API `orderAmount`            ← o LIQUIDO
--   planilha `preco_original_item`== API `mealOriginalAmount`     ← preco de tabela
--   planilha `taxa_canal_pagto`   == API `payCommissionAmount`
--   planilha forma "dinheiro"     == API `paymentMethod` = 2      (21/21 pedidos)
--
-- Isso importa porque o fallback anterior usava `mealOriginalAmount` como
-- bruto (o preco de TABELA, ~17% acima do bruto real) e `settlementAmount`
-- como liquido (o repasse, ~20% ABAIXO do que fica na loja, porque ja desconta
-- canal de pagamento e vale-refeicao). Uma loja no fallback e outra na
-- planilha apareciam lado a lado medidas com reguas diferentes.
--
-- Com a de-para provada, a planilha e a API viram a MESMA regua — e por isso o
-- resumo pode misturar dia da planilha com dia da API sem criar degrau no meio
-- do mes.
--
-- ── SINAIS ────────────────────────────────────────────────────────────────
-- Os valores de despesa chegam NEGATIVOS da 99 (sao debitos). Aqui saem
-- positivos, que e como as telas esperam.
--
-- `order_type = 1` e o pedido de receita. Os outros tipos sao ajuste, taxa
-- mensal e estorno (2..5): entram no fluxo de caixa, nao na contagem de
-- pedidos. Somar todos inflava o numero de pedidos e derrubava o ticket medio,
-- porque tipo 4 e 5 tem `mealOriginalAmount` zero.
create or replace function public.ninefood_api_diario(
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
  recebido_direto numeric
)
language sql
stable
set search_path = public
as $$
  select
    sl.unit_id,
    b.business_date::date as dia,
    count(*)::int as pedidos,
    coalesce(sum((b.raw->>'commissionBaseAmount')::numeric), 0) / 100 as bruto,
    coalesce(sum((b.raw->>'orderAmount')::numeric), 0) / 100 as liquido,
    -coalesce(sum((b.raw->>'commissionAmount')::numeric), 0) / 100 as comissao,
    -coalesce(sum((b.raw->>'payCommissionAmount')::numeric), 0) / 100 as taxa_canal,
    -coalesce(sum((b.raw->>'shopActivityOutcome')::numeric), 0) / 100 as promo,
    count(*) filter (
      where coalesce(b.raw->>'cancelDateTime', '') <> ''
    )::int as cancelados,
    coalesce(
      sum((b.raw->>'orderAmount')::numeric) filter (where b.payment_method = 2),
      0
    ) / 100 as recebido_direto
  from public.ninefood_api_bill b
  join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
  where sl.unit_id = any(p_unit_ids)
    and b.order_type = 1
    and b.business_date between p_de and p_ate
  group by sl.unit_id, b.business_date::date;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public`.
--
-- O grant padrao de EXECUTE em funcao e pro papel PUBLIC, e o anon HERDA dele:
-- revogar so de anon e authenticated deixa a porta aberta pelo papel generico.
-- Ja aconteceu tres vezes neste repositorio — ver 0083, 0151 e 0226.
revoke execute on function public.ninefood_api_diario(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_api_diario(uuid[], date, date)
  to service_role;

comment on function public.ninefood_api_diario is
  'Financeiro da API do 99 por loja/dia, na mesma regua do relatorio diario (bruto=commissionBaseAmount, liquido=orderAmount). So order_type=1.';
