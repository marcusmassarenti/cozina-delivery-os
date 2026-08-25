-- O relatorio "Dados do pedido" do 99, agregado por LOJA e por DIA.
--
-- ── PARA QUE ─────────────────────────────────────────────────────────────
-- Duas coisas que hoje descem linha a linha pelo PostgREST pra virar soma em
-- JS: a venda direta (dinheiro na porta) e o LIQUIDO real da loja.
--
-- O liquido e o motivo desta migration. O `ninefood_daily_loja` (a planilha
-- diaria) traz, em 69 meses-loja de 4 clientes, um "liquido" MAIOR que o
-- proprio bruto -- numero impossivel. Nesses casos o sistema descartava a
-- coluna e derivava `bruto - comissao - taxa - promocao`, e essa conta esta
-- errada: a "despesa de ofertas" da planilha inclui promocao que o 99 bancou
-- e frete, que nao saem do bolso do lojista. Descontar tudo como se fosse
-- dele produzia coisas como a Marmitex Faisao ficando com 45% do que vende,
-- quando fica com 86%. Sempre para baixo, nunca para cima.
--
-- O numero certo ja estava no banco: `receita_real_loja`, do relatorio de
-- pedido. Nao e estimativa -- em 456 dias que a planilha e a API do 99 cobrem
-- juntos, 74% batem dentro de R$ 1 e o total difere 1,2%. E o mesmo campo que
-- a API chama de `orderAmount` (medido pedido a pedido, ver a migration 0227).
--
-- ── O QUE ESTA RPC NAO DECIDE ────────────────────────────────────────────
-- Ela soma; quem escolhe a fonte e o `getNinefoodResumoByUnits`. E ele so usa
-- este numero quando o relatorio de pedido cobre TODOS os dias com venda do
-- mes: soma parcial apresentada como total e o erro que este projeto ja pagou
-- caro pra aprender.
create or replace function public.ninefood_pedidos_diario(
  p_unit_ids uuid[],
  p_de date,
  p_ate date
)
returns table (
  unit_id uuid,
  dia date,
  pedidos integer,
  receita_real_loja numeric,
  recebido_direto numeric
)
language sql
stable
set search_path = public
as $$
  select
    p.unit_id,
    p.data as dia,
    count(*)::int as pedidos,
    coalesce(sum(p.receita_real_loja), 0) as receita_real_loja,
    -- Dinheiro pago na porta: fica no caixa da loja e nao passa pelo repasse.
    -- Dois vocabularios convivem na coluna -- o texto da planilha e o codigo
    -- cru do `pay_method` que o webhook grava ("2" = dinheiro).
    coalesce(
      sum(p.receita_vendas) filter (
        where p.forma_pagamento in ('Pagamento em dinheiro', '2')
      ),
      0
    ) as recebido_direto
  from public.ninefood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.data between p_de and p_ate
  group by p.unit_id, p.data;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public`.
--
-- O grant padrao de EXECUTE em funcao e pro papel PUBLIC, e o anon HERDA dele:
-- revogar so de anon e authenticated deixa a porta aberta pelo papel generico.
-- Ja aconteceu tres vezes neste repositorio -- ver 0083, 0151 e 0226.
revoke execute on function public.ninefood_pedidos_diario(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_pedidos_diario(uuid[], date, date)
  to service_role;

comment on function public.ninefood_pedidos_diario is
  'Relatorio de pedido do 99 por loja/dia: liquido real da loja (receita_real_loja) e venda direta em dinheiro.';
