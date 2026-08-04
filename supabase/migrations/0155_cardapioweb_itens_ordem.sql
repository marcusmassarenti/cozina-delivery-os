-- Corrige a ORDEM das listas de itens vendidos do Cardápio Web.
--
-- O QUE ESTAVA ERRADO: o topo ("mais vendidos") ordenava por RECEITA e o rodapé
-- ("os que menos saem") ordenava por QUANTIDADE. Duas réguas diferentes pro
-- mesmo conjunto. O resultado é que as listas se contradiziam: na primeira loja
-- de produção, o "Combo 2 Central Park + 2 Coca-Cola lata" era o 4º item que
-- MAIS faturava (R$ 340,50) e aparecia entre os que MENOS saem, porque só
-- vendeu 3 unidades.
--
-- Com poucos itens distintos — 20 nessa loja — as duas listas são a MESMA lista
-- lida de pontas opostas. Misturar critérios é garantia de confusão: cada
-- coluna parece fora de ordem porque está ordenada por outra coluna.
--
-- Agora as duas usam RECEITA, e `row_number()` sobre a mesma base garante que
-- topo e fundo nunca se sobreponham. O `nome` no fim do ORDER BY desempata:
-- sem ele, itens com o mesmo valor trocam de posição a cada carregamento e a
-- tela parece instável.
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
  ),
  ranqueado as (
    select *,
           row_number() over (order by receita desc, qtd desc, nome) rank_topo,
           row_number() over (order by receita asc, qtd asc, nome) rank_fundo
    from itens
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object(
        'itens_distintos', count(*),
        'unidades', coalesce(sum(qtd), 0),
        'receita', coalesce(sum(receita), 0),
        'pedidos', (select count(*) from pedidos)
      ) from itens),
    'itens', (select coalesce(jsonb_agg(x order by pos), '[]'::jsonb) from (
        select rank_topo pos, jsonb_build_object(
          'nome', nome, 'externalCode', external_code, 'emCombo', em_combo,
          'qtd', qtd, 'receita', receita, 'pedidos', pedidos
        ) x
        from ranqueado where rank_topo <= p_limite
      ) t),
    'menos', (select coalesce(jsonb_agg(x order by pos), '[]'::jsonb) from (
        select rank_fundo pos, jsonb_build_object(
          'nome', nome, 'externalCode', external_code, 'emCombo', em_combo,
          'qtd', qtd, 'receita', receita, 'pedidos', pedidos
        ) x
        from ranqueado where rank_fundo <= 15
      ) t),
    'complementos', (select coalesce(jsonb_agg(x order by pos), '[]'::jsonb) from (
        select row_number() over (order by qtd desc, receita desc, nome) pos,
               jsonb_build_object(
                 'nome', nome, 'grupo', grupo, 'qtd', qtd,
                 'receita', receita, 'pedidos', pedidos
               ) x
        from opcoes
      ) t where pos <= 20)
  );
$$;

comment on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) is
  'Itens e complementos VENDIDOS no Cardapio Web. Topo e fundo usam a MESMA regua (receita). So leitura.';

-- `create or replace` NÃO preserva os grants: sem repetir os revokes aqui, a
-- função voltaria a ser executável por `anon`. É o P0 que já reincidiu duas
-- vezes neste projeto (0083 e 0151).
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from public;
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from anon;
revoke all on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) from authenticated;
grant execute on function cardapioweb_itens_vendidos(uuid[], timestamptz, timestamptz, text[], uuid[], int) to service_role;
