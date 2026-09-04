-- ┌─────────────────────────────────────────────────────────────┐
-- │ Auditoria de RLS — cole no Supabase SQL Editor               │
-- │ Multi-tenant (holding/brand/unit) — RLS é vida ou morte.     │
-- └─────────────────────────────────────────────────────────────┘
--
-- Rode CADA bloco separado. Cada um responde uma pergunta:
--   1) Quais tabelas em public NÃO têm RLS habilitada?
--   2) Quais tabelas têm RLS mas ZERO policies (= ninguém entra)?
--   3) Quais policies existem, pra quem (roles) e o que liberam?
--   4) Tabelas com policy permissiva pra anon/public (risco alto).
--   5) Teste manual: simular um franqueado e tentar ler unidade
--      alheia (rode na SQL como service_role, troque os UUIDs).

-- ──────────────────────────────────────────────────────────────
-- 1) Tabelas em public SEM RLS habilitada
-- ──────────────────────────────────────────────────────────────
select
  c.relname                                  as tabela,
  case when c.relrowsecurity then 'on' else 'OFF — RISCO' end as rls_status,
  case when c.relforcerowsecurity then 'forced' else '—' end   as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'                         -- só tabelas comuns
order by c.relrowsecurity, c.relname;

-- ──────────────────────────────────────────────────────────────
-- 2) Tabelas com RLS habilitada mas ZERO policies (ninguém lê)
--    Em Supabase isso normalmente é intencional pra tabela "fechada"
--    (acesso só via service_role), mas vale revisar caso a caso.
-- ──────────────────────────────────────────────────────────────
select
  c.relname as tabela_sem_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity                                       -- RLS ligada
  and not exists (
    select 1 from pg_policy p where p.polrelid = c.oid
  )
order by 1;

-- ──────────────────────────────────────────────────────────────
-- 3) Todas as policies do schema public
-- ──────────────────────────────────────────────────────────────
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text                  as for_roles,
  cmd                          as command,
  qual                         as using_expr,
  with_check                   as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ──────────────────────────────────────────────────────────────
-- 4) Policies que envolvem anon ou public (potencial vazamento)
-- ──────────────────────────────────────────────────────────────
select
  tablename,
  policyname,
  roles::text as for_roles,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and (
       'anon'    = any(roles)
    or 'public'  = any(roles)
    or roles = '{anon}'::name[]
    or roles = '{public}'::name[]
  )
order by tablename, policyname;

-- ──────────────────────────────────────────────────────────────
-- 5) Teste manual: simular franqueado e tentar ler unidade alheia
-- ──────────────────────────────────────────────────────────────
-- Substitua os UUIDs pelos reais do seu ambiente. Rode no SQL Editor
-- como user "anon" (não como postgres/service_role, que bypassa RLS).
--
-- a) Liste 2 unidades distintas:
--   select id, codigo from public.units order by codigo limit 5;
--
-- b) Liste users e a unit_id que eles têm acesso:
--   select uua.user_id, p.email, uua.unit_id
--   from public.user_unit_access uua
--   left join public.profiles p on p.id = uua.user_id;
--
-- c) Simule a sessão de um franqueado e tente ler unidade alheia.
--    No SQL Editor não dá pra trocar de role facilmente; o jeito real
--    é abrir 2 abas anônimas no navegador, logar como franqueado em
--    cada uma e tentar acessar URLs de unidades fora do user_unit_access.
--    Se a página renderizar dados da unidade alheia: RLS está furada.
