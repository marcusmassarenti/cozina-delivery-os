-- "A receber do 99" por loja: venda feita cujo repasse ainda não caiu.
--
-- POR QUE. O 99 paga com 4 a 9 dias de atraso. O painel conta por DATA DA
-- VENDA e o banco por DATA DO REPASSE, então todo lojista que compara as duas
-- telas acha que recebeu menos do que vendeu. Kawaii Poke (DG FOODS, via
-- Diego, 01/09/26): R$ 19.741 no banco contra R$ 23.100 na tela — e faltavam
-- exatamente R$ 3.678,89 de vendas ainda na fila do 99. Com o número na tela,
-- a conta fecha sozinha e a pergunta não vira chamado.
--
-- `expect_settle_date` e `settlement_amount` são do próprio 99, não estimativa
-- nossa. `settlement_amount` é o que ela DEPOSITA — já líquido de promoção que
-- a loja bancou e dos ajustes do período. Medido em ago/26 na rede:
-- `orderAmount` soma R$ 252,8 mil e `settlementAmount` R$ 200,2 mil; o que
-- cai no banco é o segundo. Mesmo par que o Fluxo de Caixa já usa.
--
-- `settlement_amount > 0` de propósito: a tabela tem linhas de AJUSTE com
-- valor negativo (estorno, chargeback) e sem pedido associado. Elas reduzem o
-- depósito, mas somá-las aqui faria "a receber" oscilar por motivo que o
-- lojista não relaciona com venda nenhuma. O ajuste aparece no repasse; este
-- número responde "quanto das minhas vendas ainda vem".
--
-- Agregado no banco: a tabela passa de 100 mil linhas, e trazer linha crua pra
-- somar em JS é a doença que já mordeu o Fluxo de Caixa (127 requisições
-- sequenciais pra produzir 5 números).
create or replace function public.ninefood_a_receber_by_shops(
  p_shop_ids text[],
  p_de date
)
returns table(app_shop_id text, valor numeric, proxima_data date, pedidos integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    b.app_shop_id,
    coalesce(round(sum(b.settlement_amount)::numeric, 2), 0) as valor,
    min(b.expect_settle_date::date) as proxima_data,
    count(*)::integer as pedidos
  from public.ninefood_api_bill b
  where b.app_shop_id = any(p_shop_ids)
    and b.expect_settle_date is not null
    and b.expect_settle_date::date >= p_de
    and b.settlement_amount > 0
  group by b.app_shop_id;
$function$;

-- Só o servidor chama. security definer aberto pro logado é o P1 de 01/09
-- (migration 0253) e o P0 que voltou 2× antes dele.
revoke all on function public.ninefood_a_receber_by_shops(text[], date) from public, anon, authenticated;
grant execute on function public.ninefood_a_receber_by_shops(text[], date) to service_role;
