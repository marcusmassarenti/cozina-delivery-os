-- ⚠️ CORREÇÃO: a Ficha Técnica lia a tabela ERRADA do iFood.
--
-- Sintoma (Marcus, 16/08): "todas as unidades estão sem iFood". Eu respondi que
-- não era bug — que o relatório de itens não tinha sido importado. Estava
-- errado. Ele então perguntou de onde vinha o "Top produtos" de um cliente que
-- só usa API, e foi isso que abriu o caso.
--
-- Existem DUAS tabelas de item do iFood:
--   ifood_daily_items            — relatório DIÁRIO. Pouco importado: 226 linhas
--                                  no Churrasco no Pote, e nada depois de 27/07.
--   ifood_cardapio_periodo_items — relatório de CARDÁPIO, por período. 1.248
--                                  linhas, até 10/08. É esta que o Top produtos,
--                                  o funil e a Ficha antiga sempre usaram.
--
-- Eu peguei a primeira. Resultado: iFood zerado em agosto na tela inteira, com
-- um aviso meu explicando com convicção um motivo que não existia. Na JK a
-- correção traz de volta 50 itens e R$ 48.830 de receita.
--
-- ── A REGRA DA JANELA VIGENTE, AGORA EM SQL ─────────────────────────────
-- O relatório de Cardápio é um SNAPSHOT de um período escolhido na exportação,
-- e o lojista exporta quantas vezes quiser — janelas que se SOBREPÕEM. Somar
-- todas conta a mesma venda de novo; a leitura correta é ficar com UMA, a mais
-- recente (maior period_end; empate, a importação mais nova). É a mesma regra
-- do `apenasJanelaVigente` em ifood-imported.ts, que o resto do sistema aplica
-- em JS. Aqui ela precisa existir em SQL porque a agregação acontece no banco.
create or replace function public.ifood_itens_janela_vigente(
  p_unit_ids uuid[],
  p_year int,
  p_month int
)
returns table (unit_id uuid, nome_item text, qtd numeric, receita numeric)
language sql
stable
security definer
set search_path = public
as $$
  with janela as (
    select distinct on (i.unit_id) i.unit_id, i.period_end, i.imported_at
    from public.ifood_cardapio_periodo_items i
    where i.unit_id = any(p_unit_ids)
      and extract(year from i.period_end) = p_year
      and extract(month from i.period_end) = p_month
    order by i.unit_id, i.period_end desc, i.imported_at desc nulls last
  )
  select i.unit_id, i.nome_item,
         sum(coalesce(i.qtd_vendida,0))::numeric,
         sum(coalesce(i.valor_total,0))::numeric
  from public.ifood_cardapio_periodo_items i
  join janela j
    on j.unit_id = i.unit_id
   and j.period_end = i.period_end
   -- `imported_at` pode ser null nas linhas antigas: sem o coalesce dos dois
   -- lados o join descarta justamente elas (null <> null).
   and coalesce(j.imported_at, 'epoch'::timestamptz) = coalesce(i.imported_at, 'epoch'::timestamptz)
  where i.nome_item is not null
  group by i.unit_id, i.nome_item;
$$;

revoke all on function public.ifood_itens_janela_vigente(uuid[], int, int) from public, anon, authenticated;
grant execute on function public.ifood_itens_janela_vigente(uuid[], int, int) to service_role;

-- `itens_vendidos_mes` e `custo_resumo_lojas` passam a chamar a função acima no
-- lugar de ler `ifood_daily_items`. O corpo das duas está no banco (aplicado
-- junto com esta migration); o que muda é só o ramo do iFood.

-- ── A JANELA QUE FOI USADA, exposta pra tela ────────────────────────────────
--
-- ⚠️ POR QUE ISTO PRECISA APARECER (Marcus, 16/08): "por que Jardins tem tanto
-- produto a mais que Pinheiros sendo que é a mesma rede?"
--
-- Não é a loja: é a JANELA. O relatório de Cardápio do iFood é exportado à mão,
-- e cada loja pode ter um período diferente. Em agosto/26, treze lojas do
-- Churrasco no Pote têm a janela 27/07→04/08 (8 dias) e a Jardins tem
-- 12/07→10/08 (30 dias). Jardins aparece com quase o dobro de itens e muito
-- mais receita porque está mostrando quase quatro vezes mais dias — não porque
-- vende mais.
--
-- Comparar loja com loja sem dizer isso é comparar coisas diferentes com a
-- mesma cara. A tela passa a mostrar o período de cada uma.
create or replace function public.ifood_janela_usada(
  p_unit_ids uuid[],
  p_year int,
  p_month int
)
returns table (unit_id uuid, period_start date, period_end date, dias int)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (i.unit_id)
         i.unit_id, i.period_start, i.period_end,
         (i.period_end - i.period_start + 1)::int
  from public.ifood_cardapio_periodo_items i
  where i.unit_id = any(p_unit_ids)
    and extract(year from i.period_end) = p_year
    and extract(month from i.period_end) = p_month
  order by i.unit_id, i.period_end desc, i.imported_at desc nulls last;
$$;

revoke all on function public.ifood_janela_usada(uuid[], int, int) from public, anon, authenticated;
grant execute on function public.ifood_janela_usada(uuid[], int, int) to service_role;
