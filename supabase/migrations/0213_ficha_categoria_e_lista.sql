-- Ficha Técnica: categoria do item, resumo por loja e a lista de lojas.
--
-- ── A CATEGORIA NÃO VEM DAS PLATAFORMAS (verificado, não suposto) ────────
-- Marcus perguntou se dava pra separar por categoria vindo dos relatórios e das
-- APIs. Fui olhar a base antes de responder:
--
--   iFood  — TEM a coluna, e ela é inútil: os 130 itens do Churrasco no Pote
--            estão como "Em 1 categorias", "Em 2 categorias". É uma CONTAGEM
--            de em quantas categorias o item aparece, não o nome de nenhuma.
--   Keeta  — não manda categoria no relatório de item.
--   99Food — o item diário não tem; o catálogo da API tem `category_name`, mas
--            preenchido em 3 de 399 linhas.
--   CW     — único com categoria de verdade: 11 categorias em 208 itens do
--            catálogo, ligáveis por `item_id`.
--
-- Então a categoria é campo do CLIENTE, não da plataforma. O Cardápio Web
-- entra como sugestão quando existir; o resto é digitado (ou vem da planilha).
alter table public.item_custos
  add column if not exists categoria text;

comment on column public.item_custos.categoria is
  'Categoria do item, do cliente. Não vem das plataformas — ver o cabeçalho da migration 0213.';

create index if not exists item_custos_categoria_idx
  on public.item_custos (unit_id, categoria) where categoria is not null;

-- ── Resumo por loja, pra tela-índice ────────────────────────────────────────
--
-- ⚠️ UMA consulta pras N lojas, não N consultas. Com 500 lojas na rede, abrir a
-- lista chamando `itens_vendidos_mes` por loja seriam 500 idas ao banco só pra
-- desenhar uma tabela — é o padrão que já derrubou outras telas aqui.
--
-- A comissão fica de fora de propósito: ela vem dos agregadores por plataforma
-- no servidor, que já recebem a lista de lojas de uma vez e são a MESMA fonte
-- que alimenta o DRE. Recalcular aqui criaria um segundo número pro mesmo
-- conceito, e o dia em que os dois divergirem ninguém saberá qual é o certo.
create or replace function public.custo_resumo_lojas(
  p_unit_ids uuid[],
  p_year int,
  p_month int
)
returns table (
  unit_id uuid,
  platform text,
  itens bigint,
  itens_com_custo bigint,
  receita numeric,
  receita_com_custo numeric,
  custo_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with vendas as (
    select i.unit_id, 'ifood'::text as platform, i.nome_item,
           sum(coalesce(i.qtd_vendida,0))::numeric as qtd,
           sum(coalesce(i.valor_total,0))::numeric as receita
    from public.ifood_daily_items i
    where i.unit_id = any(p_unit_ids)
      and extract(year from i.date) = p_year and extract(month from i.date) = p_month
      and i.nome_item is not null
    group by i.unit_id, i.nome_item
    union all
    select n.unit_id, '99food', n.nome_item,
           sum(coalesce(n.qtd_vendida,0))::numeric, sum(coalesce(n.receita,0))::numeric
    from public.ninefood_daily_item n
    where n.unit_id = any(p_unit_ids)
      and extract(year from n.data) = p_year and extract(month from n.data) = p_month
      and n.nome_item is not null
    group by n.unit_id, n.nome_item
    union all
    select k.unit_id, 'keeta', k.nome_item,
           sum(coalesce(k.qtd_vendida,0))::numeric,
           sum(coalesce(k.qtd_vendida,0) * coalesce(k.preco_medio,0))::numeric
    from public.keeta_daily_item k
    where k.unit_id = any(p_unit_ids)
      and k.ref_year = p_year and k.ref_month = p_month
      and k.nome_item is not null
    group by k.unit_id, k.nome_item
    union all
    select ci.unit_id, 'cardapioweb', ci.nome,
           sum(coalesce(ci.quantidade,0))::numeric, sum(coalesce(ci.preco_total,0))::numeric
    from public.cardapioweb_pedido_itens ci
    join public.cardapioweb_pedidos p on p.id = ci.pedido_id
    where ci.unit_id = any(p_unit_ids)
      and p.ref_year = p_year and p.ref_month = p_month
      and p.status <> 'canceled' and ci.nome is not null
    group by ci.unit_id, ci.nome
  )
  select v.unit_id, v.platform,
         count(*)::bigint,
         count(c.custo)::bigint,
         sum(v.receita)::numeric,
         coalesce(sum(v.receita) filter (where c.custo is not null), 0)::numeric,
         coalesce(sum(v.qtd * c.custo) filter (where c.custo is not null), 0)::numeric
  from vendas v
  left join public.item_custos c
    on c.unit_id = v.unit_id and c.platform = v.platform and c.nome_item = v.nome_item
  where v.qtd > 0
  group by v.unit_id, v.platform;
$$;

revoke all on function public.custo_resumo_lojas(uuid[], int, int) from public, anon, authenticated;
grant execute on function public.custo_resumo_lojas(uuid[], int, int) to service_role;

-- ── itens_vendidos_mes ganha a categoria do Cardápio Web ────────────────────
-- DROP e não `create or replace`: mudar o `returns table` de uma função exige
-- derrubar antes (o Postgres recusa a troca de assinatura).
drop function if exists public.itens_vendidos_mes(uuid, int, int);

create or replace function public.itens_vendidos_mes(
  p_unit_id uuid,
  p_year int,
  p_month int
)
returns table (
  platform text,
  nome_item text,
  qtd numeric,
  receita numeric,
  categoria_plataforma text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select 'ifood'::text as platform, i.nome_item,
           sum(coalesce(i.qtd_vendida,0))::numeric as qtd,
           sum(coalesce(i.valor_total,0))::numeric as receita,
           null::text as categoria_plataforma
    from public.ifood_daily_items i
    where i.unit_id = p_unit_id
      and extract(year from i.date) = p_year
      and extract(month from i.date) = p_month
      and i.nome_item is not null
    group by i.nome_item
    union all
    select '99food', n.nome_item,
           sum(coalesce(n.qtd_vendida,0))::numeric,
           sum(coalesce(n.receita,0))::numeric,
           null::text
    from public.ninefood_daily_item n
    where n.unit_id = p_unit_id
      and extract(year from n.data) = p_year
      and extract(month from n.data) = p_month
      and n.nome_item is not null
    group by n.nome_item
    union all
    select 'keeta', k.nome_item,
           sum(coalesce(k.qtd_vendida,0))::numeric,
           sum(coalesce(k.qtd_vendida,0) * coalesce(k.preco_medio,0))::numeric,
           null::text
    from public.keeta_daily_item k
    where k.unit_id = p_unit_id
      and k.ref_year = p_year
      and k.ref_month = p_month
      and k.nome_item is not null
    group by k.nome_item
    union all
    select 'cardapioweb', ci.nome,
           sum(coalesce(ci.quantidade,0))::numeric,
           sum(coalesce(ci.preco_total,0))::numeric,
           max(cat.categoria_nome)
    from public.cardapioweb_pedido_itens ci
    join public.cardapioweb_pedidos p on p.id = ci.pedido_id
    left join public.cardapioweb_catalogo_itens cat
      on cat.unit_id = ci.unit_id and cat.item_id = ci.item_id
    where ci.unit_id = p_unit_id
      and p.ref_year = p_year
      and p.ref_month = p_month
      and p.status <> 'canceled'
      and ci.nome is not null
    group by ci.nome
  )
  select platform, nome_item, qtd, receita, categoria_plataforma
  from base
  where qtd > 0
  order by receita desc nulls last;
$$;

revoke all on function public.itens_vendidos_mes(uuid, int, int) from public, anon, authenticated;
grant execute on function public.itens_vendidos_mes(uuid, int, int) to service_role;
