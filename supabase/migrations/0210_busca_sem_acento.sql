-- Busca que ignora acento: "ribeira" acha "Ribeirão Preto".
--
-- ── O PROBLEMA (Marcus, 16/08/26) ────────────────────────────────────────
-- "quando colocar um nome que tem acentuação, se não colocar o acento deve
-- aparecer também". O `ilike '%ribeira%'` não achava "Ribeirão Preto" porque
-- na 7ª letra compara 'a' com 'ã' e desiste. Quem digita rápido não põe acento
-- — e a loja simplesmente sumia, como se não existisse.
--
-- ── POR QUE PRECISA DE UM WRAPPER IMMUTABLE ──────────────────────────────
-- `unaccent(text)` é STABLE, não IMMUTABLE: com um argumento só, ela resolve o
-- dicionário pelo `search_path` em tempo de execução, e o Postgres se recusa a
-- indexar uma função que pode mudar de resposta. Sem índice, cada busca vira
-- varredura da tabela — o oposto do que esta tela acabou de conquistar.
--
-- A saída canônica é fixar o dicionário no primeiro argumento e declarar o
-- wrapper como IMMUTABLE. Aí dá pra indexar `f_unaccent(name)`.
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path to 'public'
as $function$
  -- Dicionário QUALIFICADO. A extensão `unaccent` foi instalada no schema
  -- `public` neste projeto (migration 0208) — em outros ela cai em
  -- `extensions`, e é justamente por isso que o nome vai fixo aqui em vez de
  -- depender do search_path de quem chama.
  select public.unaccent('public.unaccent'::regdictionary, $1)
$function$;

comment on function public.f_unaccent(text) is
  'unaccent() IMMUTABLE (dicionário fixo) — a versão de 1 argumento é STABLE e não pode ser indexada.';

-- Índice na forma SEM ACENTO, que é a forma efetivamente comparada. O índice
-- antigo (sobre `name` cru) não serve mais à busca e sai junto.
create index if not exists units_name_unaccent_trgm_idx
  on public.units using gin (public.f_unaccent(name) gin_trgm_ops);
drop index if exists public.units_name_trgm_idx;

create index if not exists units_city_unaccent_trgm_idx
  on public.units using gin (public.f_unaccent(city) gin_trgm_ops);

-- A listagem passa a comparar os dois lados sem acento.
--
-- ⚠️ Os dois lados. Comparar só a coluna resolveria "ribeira" → "Ribeirão",
-- mas quebraria o contrário: quem digita "Ribeirão" (com acento, do jeito
-- certo) não acharia nada, porque a coluna normalizada não tem o 'ã'.
create or replace function public.unidades_lista(
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
        public.f_unaccent(u.name) ilike '%' || public.f_unaccent(p_q) || '%' or
        u.code ilike '%' || p_q || '%' or
        public.f_unaccent(coalesce(u.city, '')) ilike '%' || public.f_unaccent(p_q) || '%' or
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
