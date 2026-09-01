-- Custo de entrega do iFood contava pedido cancelado EM DOBRO.
--
-- POR QUE. Esta RPC fazia `sum(abs(l.valor))` sobre TODAS as linhas de "Taxa
-- entrega iFood", sem olhar `fato_gerador`. O cancelamento estorna a taxa numa
-- linha POSITIVA de mesmo valor, então num pedido cancelado:
--
--   Venda               'Taxa entrega iFood'   -8,99
--   Cancelamento Total  'Taxa entrega iFood'   +8,99
--   abs() de cada uma  ->  8,99 + 8,99 = 17,98   (o certo é ZERO)
--
-- Medido em ago/26: R$ 4.761,73 de custo de entrega inventado na rede.
-- Churrasco no Pote exibia R$ 79.326,88 contra R$ 77.394,96 reais (+2,5%);
-- DG FOODS R$ 37.873,78 contra R$ 35.836,22.
--
-- A CORREÇÃO É SOMAR COM SINAL, não filtrar `fato_gerador = 'Venda'`.
-- O filtro resolveria o cancelamento TOTAL e deixaria passar o PARCIAL, onde
-- o iFood devolve só parte da taxa num lançamento de cancelamento parcial.
-- `-sum(valor)` abate os dois casos sozinho, sem join e sem CTE: o que sobra
-- é exatamente o frete líquido que a loja pagou.
--
-- ⚠️ MESMO CONCEITO EM DOIS LUGARES. `src/lib/data/taxa-entrega.ts` tem o
-- caminho paginado de fallback com o MESMO `Math.abs()` linha a linha — ele
-- foi corrigido junto, do mesmo jeito (soma com sinal). Se um dia mudar a
-- régua aqui, mudar lá também, senão o fallback passa a discordar em silêncio
-- justamente quando a RPC falha.

create or replace function public.ifood_taxa_entrega_by_units(
  p_unit_ids uuid[], p_year integer, p_month integer
)
returns table(unit_id uuid, taxa numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    l.unit_id,
    -- Negativo no extrato = custo. Somar com sinal e inverter deixa o estorno
    -- do cancelamento anular a cobrança da venda.
    coalesce(round(-sum(l.valor)::numeric, 2), 0) as taxa
  from public.ifood_financeiro_lancamentos l
  where l.unit_id = any(p_unit_ids)
    and l.ref_year = p_year
    and l.ref_month = p_month
    and l.descricao_lancamento = 'Taxa entrega iFood'
  group by l.unit_id;
$function$;
