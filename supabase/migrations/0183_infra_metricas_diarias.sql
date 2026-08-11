-- Quanto o sistema PESA, medido todo dia.
--
-- O e-mail de saúde já dizia quantas LINHAS entraram; não dizia quantos MB.
-- São perguntas diferentes: 200 mil linhas de log ocupam mais que 200 mil
-- linhas de lançamento, e é o byte que aparece na fatura do Supabase.
--
-- O snapshot existe porque crescimento é DELTA: só dá pra dizer "o banco
-- cresceu 40 MB hoje" comparando com a medição de ontem. Sem a tabela, todo
-- dia mostraria o mesmo tamanho absoluto e ninguém veria a inclinação.

create table if not exists public.infra_metricas_diarias (
  dia date primary key,
  db_bytes bigint not null,
  storage_bytes bigint not null,
  storage_arquivos integer not null default 0,
  -- [{ "t": "ifood_financeiro_lancamentos", "b": 693510144 }, …]
  -- Guarda as maiores pra saber QUEM cresceu, não só que cresceu.
  tabelas jsonb not null default '[]'::jsonb,
  medido_em timestamptz not null default now()
);

comment on table public.infra_metricas_diarias is
  'Peso do banco e do storage, uma linha por dia. Base do delta no e-mail de saúde.';

-- Mede o tamanho do banco, do storage e das maiores tabelas.
--
-- SECURITY DEFINER porque pg_database_size e storage.objects não são
-- acessíveis pelo papel da aplicação. Vem com REVOKE de public/anon logo
-- abaixo: essa função responde "quanto pesa a base inteira", que é informação
-- da operação, não de cliente nenhum.
create or replace function public.infra_metricas()
returns table (
  db_bytes bigint,
  storage_bytes bigint,
  storage_arquivos integer,
  tabelas jsonb
)
language sql
security definer
set search_path = public, storage, pg_catalog
as $$
  select
    pg_database_size(current_database())::bigint,
    (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects)::bigint,
    (select count(*) from storage.objects)::integer,
    (
      select coalesce(jsonb_agg(jsonb_build_object('t', t, 'b', b) order by b desc), '[]'::jsonb)
      from (
        select c.relname::text t, pg_total_relation_size(c.oid)::bigint b
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by b desc
        limit 20
      ) x
    );
$$;

-- ⚠️ P0 que já voltou DUAS vezes neste projeto (migrations 0083 e 0151):
-- função SECURITY DEFINER nasce com EXECUTE pra public, o que a deixaria
-- chamável por qualquer visitante anônimo. Revogar é parte da criação, não
-- um passo opcional depois.
revoke all on function public.infra_metricas() from public, anon;
grant execute on function public.infra_metricas() to service_role;
