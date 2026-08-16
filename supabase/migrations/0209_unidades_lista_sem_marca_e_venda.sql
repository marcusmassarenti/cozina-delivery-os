-- Tira "Marca" e "Dados até" da listagem de unidades.
--
-- ── POR QUE SAÍRAM (Marcus, 16/08/26) ────────────────────────────────────
-- "Dados até" mostrava a data do pedido mais recente somando as quatro
-- plataformas. O Marcus derrubou com um argumento que eu não tinha visto:
-- **não diz QUAL dado nem de QUAL plataforma**. Uma loja com iFood em dia e
-- Keeta parada há duas semanas aparecia como "hoje" — a coluna escondia
-- justamente o problema que parecia estar denunciando. Uma coluna que agrega
-- fontes de frescor diferente num número só não informa, confunde.
--
-- "Marca" nunca foi campo do cadastro (vem de `brands`, criada no onboarding)
-- e o Marcus decidiu que não vai usar.
--
-- ── O QUE ISSO ECONOMIZA ─────────────────────────────────────────────────
-- Sem a última venda, some o LEFT JOIN LATERAL em quatro tabelas de pedidos:
-- eram ~16 ms por página que agora não acontecem. Sem a marca, some o JOIN com
-- `brands` — o escopo do usuário já vem por `p_unit_ids`, o join existia só
-- pra buscar o nome.
--
-- `unidades_resumo_lista` (0206) fica sem nenhum chamador e é REMOVIDA. Ela
-- viveu algumas horas; o raciocínio que ela documentava (lateral com limit 1
-- em vez de max() agrupado — 0,7 ms contra 367 ms) continua registrado aqui,
-- porque vale pra próxima vez que alguém precisar de "o mais recente por loja".
-- Mudar as colunas de retorno exige DROP: `create or replace` não altera a
-- assinatura de saída de uma função que devolve TABLE.
drop function if exists public.unidades_lista(uuid[], text, text, text[], boolean, boolean, text, text, int, int);

create function public.unidades_lista(
  p_unit_ids      uuid[]  default null,
  p_q             text    default null,
  p_city          text    default null,
  p_platforms     text[]  default null,
  p_only_active   boolean default false,
  p_com_pendencia boolean default false,
  p_sort          text    default 'code',
  p_dir           text    default 'asc',
  p_limit         int     default 50,
  p_offset        int     default 0
)
returns table(
  id uuid, code text, name text, city text, state text, cnpj text,
  active boolean, brand_id uuid, logo_url text,
  data_inauguracao date, data_encerramento date,
  razao_social text, nome_fantasia text, tipo_cozinha text, tipo_operacao text,
  regime_fiscal text, tipo_entrega text, logradouro text, numero text,
  complemento text, bairro text, cep text, telefone text,
  responsavel_nome text, responsavel_email text,
  cnae_descricao text, situacao_cadastral text,
  faltando int, total bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with escopo as (
    select u.*
    from units u
    where (p_unit_ids is null or u.id = any(p_unit_ids))
      and (not p_only_active or u.active)
      and (p_city is null or u.city = p_city)
      and (
        p_q is null or p_q = '' or
        u.name ilike '%' || p_q || '%' or
        u.code ilike '%' || p_q || '%' or
        coalesce(u.city, '') ilike '%' || p_q || '%' or
        (regexp_replace(p_q, '\D', '', 'g') <> ''
         and regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g')
             like '%' || regexp_replace(p_q, '\D', '', 'g') || '%')
      )
      and (
        p_platforms is null or cardinality(p_platforms) = 0 or
        (select count(distinct up.platform) from unit_platforms up
          where up.unit_id = u.id and up.active
            and up.platform = any(p_platforms)) = cardinality(p_platforms)
      )
  ),
  -- Mesma lista de campos de src/lib/cadastro-campos.ts.
  contado as (
    select e.*,
      (
        (nullif(trim(coalesce(e.cnpj,'')),'') is null)::int +
        (nullif(trim(coalesce(e.razao_social,'')),'') is null)::int +
        (nullif(trim(coalesce(e.tipo_cozinha,'')),'') is null)::int +
        (nullif(trim(coalesce(e.logradouro,'')),'') is null)::int +
        (nullif(trim(coalesce(e.numero,'')),'') is null)::int +
        (nullif(trim(coalesce(e.bairro,'')),'') is null)::int +
        (nullif(trim(coalesce(e.cep,'')),'') is null)::int +
        (nullif(trim(coalesce(e.telefone,'')),'') is null)::int +
        (nullif(trim(coalesce(e.responsavel_nome,'')),'') is null)::int +
        (nullif(trim(coalesce(e.tipo_operacao,'')),'') is null)::int +
        (nullif(trim(coalesce(e.regime_fiscal,'')),'') is null)::int +
        (nullif(trim(coalesce(e.tipo_entrega,'')),'') is null)::int +
        (e.data_inauguracao is null)::int +
        (not exists (select 1 from unit_platforms up
                      where up.unit_id = e.id and up.active))::int
      ) as faltando
    from escopo e
  ),
  filtrado as (
    select * from contado c
    where not p_com_pendencia or (c.faltando > 0 and c.active)
  )
  select
    f.id, f.code, f.name, f.city, f.state, f.cnpj,
    f.active, f.brand_id, f.logo_url,
    f.data_inauguracao, f.data_encerramento,
    f.razao_social, f.nome_fantasia, f.tipo_cozinha, f.tipo_operacao,
    f.regime_fiscal, f.tipo_entrega, f.logradouro, f.numero,
    f.complemento, f.bairro, f.cep, f.telefone,
    f.responsavel_nome, f.responsavel_email,
    f.cnae_descricao, f.situacao_cadastral,
    f.faltando, count(*) over() as total
  from filtrado f
  order by
    case when p_dir <> 'desc' and p_sort = 'name'     then f.name end asc,
    case when p_dir <> 'desc' and p_sort = 'city'     then f.city end asc,
    case when p_dir <> 'desc' and p_sort = 'faltando' then f.faltando end asc,
    case when p_dir <> 'desc' and p_sort not in ('name','city','faltando') then f.code end asc,
    case when p_dir  = 'desc' and p_sort = 'name'     then f.name end desc,
    case when p_dir  = 'desc' and p_sort = 'city'     then f.city end desc,
    case when p_dir  = 'desc' and p_sort = 'faltando' then f.faltando end desc,
    case when p_dir  = 'desc' and p_sort not in ('name','city','faltando') then f.code end desc,
    f.code asc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$function$;

revoke execute on function public.unidades_lista(uuid[], text, text, text[], boolean, boolean, text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.unidades_lista(uuid[], text, text, text[], boolean, boolean, text, text, int, int)
  to service_role;

drop function if exists public.unidades_resumo_lista(uuid[]);
