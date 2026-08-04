-- Resumo das avaliações do Cardápio Web, agregado no banco.
--
-- A média POR DIMENSÃO exige abrir um jsonb por avaliação — não cabe numa
-- consulta simples do PostgREST, e baixar linha crua pra somar em JavaScript é
-- a doença conhecida deste projeto.
--
-- As dimensões saem da PIOR pra melhor: a que está puxando a nota pra baixo é
-- a que leva a uma ação, e ela é que precisa estar no topo da tela.
--
-- Só LEITURA.

create or replace function cardapioweb_avaliacoes_resumo(
  p_unit_ids uuid[],
  p_inicio timestamptz,
  p_fim timestamptz,
  p_install_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select a.*
    from cardapioweb_avaliacoes a
    where a.unit_id = any(p_unit_ids)
      and a.criado_em >= p_inicio
      and a.criado_em <  p_fim
      and (p_install_ids is null or cardinality(p_install_ids) = 0
           or a.install_id = any(p_install_ids))
  ),
  -- A resposta vem como TEXTO. O cast tem que tolerar valor não numérico: uma
  -- pergunta de múltipla escolha no meio não pode derrubar a média das outras.
  dims as (
    select r->>'question' dimensao,
           nullif(regexp_replace(r->>'answer', '[^0-9.]', '', 'g'), '')::numeric nota
    from base, jsonb_array_elements(coalesce(respostas, '[]'::jsonb)) r
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'media', (select round(avg(nota)::numeric, 2) from base where nota is not null),
    'comMuitoComentario', (select count(*) from base where coalesce(trim(comentario),'') <> ''),
    'distribuicao', (select coalesce(jsonb_object_agg(nota::text, qtd), '{}'::jsonb) from (
        select nota, count(*) qtd from base where nota is not null group by nota
      ) d),
    'dimensoes', (select coalesce(jsonb_agg(x order by (x->>'media')::numeric asc), '[]'::jsonb) from (
        select jsonb_build_object(
          'dimensao', dimensao,
          'media', round(avg(nota)::numeric, 2),
          'respostas', count(*)
        ) x
        from dims where dimensao is not null and nota is not null
        group by dimensao
      ) t),
    'comentarios', (select coalesce(jsonb_agg(x order by (x->>'criadoEm') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'reviewId', review_id, 'nota', nota, 'comentario', comentario,
          'criadoEm', criado_em, 'orderId', order_id
        ) x
        from base
        where coalesce(trim(comentario),'') <> ''
        order by criado_em desc limit 25
      ) t)
  );
$$;

comment on function cardapioweb_avaliacoes_resumo(uuid[], timestamptz, timestamptz, uuid[]) is
  'Resumo das avaliacoes do Cardapio Web, com media por dimensao. So leitura.';

-- `security definer` ignora RLS e o Postgres concede EXECUTE a PUBLIC por
-- padrão (o `anon` herda). P0 já reincidente neste projeto (0083 e 0151).
revoke all on function cardapioweb_avaliacoes_resumo(uuid[], timestamptz, timestamptz, uuid[]) from public;
revoke all on function cardapioweb_avaliacoes_resumo(uuid[], timestamptz, timestamptz, uuid[]) from anon;
revoke all on function cardapioweb_avaliacoes_resumo(uuid[], timestamptz, timestamptz, uuid[]) from authenticated;
grant execute on function cardapioweb_avaliacoes_resumo(uuid[], timestamptz, timestamptz, uuid[]) to service_role;
