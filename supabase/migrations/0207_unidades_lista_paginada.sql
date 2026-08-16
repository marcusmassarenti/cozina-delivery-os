-- Listagem de unidades PAGINADA — busca, filtro, ordenação e total no banco.
--
-- ── POR QUE VIROU RPC E NÃO PostgREST ────────────────────────────────────
-- O escopo do usuário chega como uma LISTA DE IDS (`getAccessibleUnitIds`).
-- No PostgREST isso vira `?id=in.(uuid,uuid,…)` na URL — e com 500 lojas são
-- ~18.500 caracteres, acima do limite de linha de requisição do proxy. A tela
-- funcionaria em todos os clientes de hoje e quebraria exatamente no cliente
-- grande, que é para quem ela está sendo feita.
--
-- RPC é POST: a lista vai no corpo. De quebra, a contagem total, o "quantos
-- campos faltam" e a ordenação passam a acontecer no mesmo lugar que a
-- paginação — sem isso, "ordenar por cadastro" exigiria trazer as 500 lojas
-- pro Node ordenar, que é justamente o que estamos saindo de fazer.
--
-- ── A ÚLTIMA VENDA É CALCULADA DEPOIS DO LIMIT, DE PROPÓSITO ──────────────
-- Ela sai de `unidades_resumo_lista` (0206), que faz um seek por loja em cada
-- uma das quatro tabelas de pedidos. Rodar isso nas 50 da página custa 16 ms;
-- rodar nas 500 pra poder ORDENAR por ela custaria ~10× e em toda abertura de
-- tela. Por isso a coluna aparece mas NÃO é ordenável nesta versão — quando
-- precisar ser, o certo é os syncs gravarem `units.ultima_venda`, não a tela
-- recalcular.
create or replace function public.unidades_lista(
  p_unit_ids      uuid[]  default null,   -- null = sem restrição (superadmin puro)
  p_q             text    default null,
  p_city          text    default null,
  p_platforms     text[]  default null,   -- exige TODAS as marcadas
  p_only_active   boolean default false,
  p_com_pendencia boolean default false,
  p_sort          text    default 'code',
  p_dir           text    default 'asc',
  p_limit         int     default 50,
  p_offset        int     default 0
)
returns table(
  id uuid, code text, name text, city text, state text, cnpj text,
  active boolean, brand_id uuid, brand_name text, logo_url text,
  data_inauguracao date, data_encerramento date,
  razao_social text, nome_fantasia text, tipo_cozinha text, tipo_operacao text,
  regime_fiscal text, tipo_entrega text, logradouro text, numero text,
  complemento text, bairro text, cep text, telefone text,
  responsavel_nome text, responsavel_email text,
  cnae_descricao text, situacao_cadastral text,
  faltando int, ultima_venda date, total bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with escopo as (
    select u.*, b.name as bname
    from units u
    join brands b on b.id = u.brand_id
    where (p_unit_ids is null or u.id = any(p_unit_ids))
      and (not p_only_active or u.active)
      and (p_city is null or u.city = p_city)
      and (
        p_q is null or p_q = '' or
        u.name ilike '%' || p_q || '%' or
        u.code ilike '%' || p_q || '%' or
        coalesce(u.city, '') ilike '%' || p_q || '%' or
        -- CNPJ comparado só em dígitos (a coluna às vezes vem mascarada), e o
        -- guard do lado esquerdo evita que uma busca por texto puro caia num
        -- `like '%%'` que casaria com TODAS as lojas.
        (regexp_replace(p_q, '\D', '', 'g') <> ''
         and regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g')
             like '%' || regexp_replace(p_q, '\D', '', 'g') || '%')
      )
      and (
        p_platforms is null or cardinality(p_platforms) = 0 or
        -- "tem TODAS as marcadas", não "tem alguma": é como os selos da tela
        -- sempre funcionaram, e trocar isso mudaria o resultado do filtro
        -- sem ninguém pedir.
        (select count(distinct up.platform) from unit_platforms up
          where up.unit_id = u.id and up.active
            and up.platform = any(p_platforms)) = cardinality(p_platforms)
      )
  ),
  -- Quantos campos faltam. A lista é a MESMA de src/lib/cadastro-campos.ts —
  -- se mudar lá, muda aqui. (complemento e e-mail do responsável ficam de
  -- fora de propósito: são opcionais no formulário.)
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
    -- Loja inativa não entra na conta de pendência: ela não vai ser cadastrada
    -- de novo, e contá-la enchia o filtro de lojas que não se resolve.
    where not p_com_pendencia or (c.faltando > 0 and c.active)
  ),
  pagina as (
    select f.*, count(*) over() as total
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
      f.code asc                                     -- desempate estável
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  )
  select
    p.id, p.code, p.name, p.city, p.state, p.cnpj,
    p.active, p.brand_id, p.bname, p.logo_url,
    p.data_inauguracao, p.data_encerramento,
    p.razao_social, p.nome_fantasia, p.tipo_cozinha, p.tipo_operacao,
    p.regime_fiscal, p.tipo_entrega, p.logradouro, p.numero,
    p.complemento, p.bairro, p.cep, p.telefone,
    p.responsavel_nome, p.responsavel_email,
    p.cnae_descricao, p.situacao_cadastral,
    p.faltando, r.ultima_venda, p.total
  from pagina p
  left join lateral (
    select v.ultima_venda
    from public.unidades_resumo_lista(array[p.id]) v
  ) r on true
$function$;

-- ⚠️ Fechada ao anônimo: é `security definer` e o escopo por usuário é
-- decidido em `getUnitsPage`, no servidor, antes de montar `p_unit_ids`.
-- Deixá-la aberta seria entregar a lista de lojas de todo mundo — a
-- reincidência de RPC anônima neste projeto já custou dois P0 (jul e ago/26).
revoke execute on function public.unidades_lista(uuid[], text, text, text[], boolean, boolean, text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.unidades_lista(uuid[], text, text, text[], boolean, boolean, text, text, int, int)
  to service_role;

-- Busca por nome é o filtro mais usado da tela e hoje é seq scan.
create extension if not exists pg_trgm;
create index if not exists units_name_trgm_idx on public.units using gin (name gin_trgm_ops);
create index if not exists units_code_idx on public.units (code);
