-- Itens e complementos VENDIDOS no Cardápio Web (mais e menos), agregados no
-- banco. É o equivalente da aba Cardápio do iFood e da 99.
--
-- POR QUE SAI DOS PEDIDOS E NÃO DO CATÁLOGO: o catálogo também está no banco,
-- mas a API devolve a versão de HOJE e não guarda como o cardápio era antes.
-- Cruzar os dois pra dizer "item que não vendeu" mente — medido na primeira
-- loja de produção: 22 itens no catálogo contra 111 nomes diferentes vendidos,
-- só 6 casando, porque o cardápio mudou no meio do caminho e nenhum item tem
-- `external_code` pra cruzar por id em vez de por nome.
--
-- Por isso 'menos' são os que venderam POUCO, nunca os que não venderam.
--
-- Agregado aqui porque os aggregates do PostgREST estão desligados neste
-- projeto e um mês de loja movimentada passa fácil das 1.000 linhas que ele
-- devolve — somar isso em JavaScript é a doença conhecida daqui.
--
-- `p_canais` e `p_install_ids` vêm de fora: as regras "o que é canal próprio" e
-- "o que é produção" moram no TypeScript, e reescrevê-las aqui criaria uma
-- segunda cópia que diverge (foi o que aconteceu com CANAIS_PROPRIOS).
--
-- Só LEITURA.

create or replace function cardapioweb_itens_vendidos(
  p_unit_ids uuid[],
  p_inicio timestamptz,
  p_fim timestamptz,
  p_canais text[] default null,
  p_install_ids uuid[] default null,
  p_limite int default 60
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pedidos as (
    select p.id, p.unit_id
    from cardapioweb_pedidos p
    where p.unit_id = any(p_unit_ids)
      and p.criado_em >= p_inicio
      and p.criado_em <  p_fim
      and p.status is distinct from 'canceled'
      and (p_canais is null or cardinality(p_canais) = 0
           or p.sales_channel = any(p_canais))
      and (p_install_ids is null or cardinality(p_install_ids) = 0
           or p.install_id = any(p_install_ids))
  ),
  itens as (
    select coalesce(nullif(trim(i.nome), ''), 'Sem nome') nome,
           max(i.external_code) external_code,
           bool_or(i.parent_item_id is not null) em_combo,
           sum(coalesce(i.quantidade, 1))::numeric qtd,
           sum(coalesce(i.preco_total,
                        coalesce(i.preco_unitario,0) * coalesce(i.quantidade,1)))::numeric receita,
           count(distinct i.pedido_id) pedidos
    from cardapioweb_pedido_itens i
    join pedidos p on p.id = i.pedido_id
    group by 1
  ),
  opcoes as (
    select coalesce(nullif(trim(o.nome), ''), 'Sem nome') nome,
           max(coalesce(nullif(trim(o.grupo_nome), ''), '—')) grupo,
           sum(coalesce(o.quantidade, 1))::numeric qtd,
           sum(coalesce(o.preco_unitario,0) * coalesce(o.quantidade,1))::numeric receita,
           count(distinct o.pedido_id) pedidos
    from cardapioweb_pedido_opcoes o
    join pedidos p on p.id = o.pedido_id
    group by 1
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object(
        'itens_distintos', count(*),
        'unidades', coalesce(sum(qtd), 0),
        'receita', coalesce(sum(receita), 0),
        'pedidos', (select count(*) from pedidos)
      ) from itens),
    'itens', (select coalesce(jsonb_agg(x order by (x->>'receita')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'nome', nome, 'externalCode', external_code, 'emCombo', em_combo,
          'qtd', qtd, 'receita', receita, 'pedidos', pedidos
        ) x
        from itens order by receita desc limit p_limite
      ) t),
    'menos', (select coalesce(jsonb_agg(x order by (x->>'qtd')::numeric asc), '[]'::jsonb) from (
        select jsonb_build_object(
          'nome', nome, 'externalCode', external_code, 'emCombo', em_combo,
          'qtd', qtd, 'receita', receita, 'pedidos', pedidos
        ) x
        from itens order by qtd asc, receita asc limit 15
      ) t),
    'complementos', (select coalesce(jsonb_agg(x order by (x->>'qtd')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'nome', nome, 'grupo', grupo, 'qtd', qtd,
          'receita', receita, 'pedidos', pedidos
        ) x
        from opcoes order by qtd desc limit 20
      ) t)
  );
$$;

comment on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) is
  'Itens e complementos VENDIDOS no Cardapio Web (mais e menos). So leitura.';

-- `security definer` IGNORA RLS, e o Postgres concede EXECUTE a PUBLIC por
-- padrão (o `anon` do Supabase herda). Sem isto, vira rota aberta pra internet
-- ler o cardápio vendido de qualquer cliente. Já aconteceu duas vezes aqui
-- (migrations 0083 e 0151).
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from public;
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from anon;
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from authenticated;
grant execute on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) to service_role;
