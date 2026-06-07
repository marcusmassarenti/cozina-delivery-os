--------------------------------------------------------------------
-- Fase 0 da comercialização — super-admin da PLATAFORMA
--
-- Separa dois conceitos que hoje estão colados:
--   - super-admin da PLATAFORMA (dono do SaaS) → vê TODOS os clientes
--   - admin de um CLIENTE → vê só a própria empresa (holding)
--
-- Antes, "admin de holding" devolvia null em getAccessibleUnitIds = "todas as
-- lojas do banco". Com 1 cliente (Cozina) tudo bem; com 2+, vazaria entre
-- empresas. Esta migration cria a flag explícita `is_superadmin` e, no backfill,
-- preserva EXATAMENTE o comportamento atual (quem vê tudo hoje continua vendo).
--
-- Como rodar:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Cole este arquivo inteiro
--   3. Run
--------------------------------------------------------------------

-- 1) Coluna nova (idempotente)
alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

-- 2) Backfill — preserva comportamento:
--    Quem HOJE enxerga a rede inteira tem perfil de escopo 'holding'
--    (administrador/gerente, ou perfil custom com data_scope='holding').
--    Esses viram super-admin pra NÃO perder acesso. Clientes novos entram
--    com is_superadmin=false (definido no provisionamento da Fase 1).
update public.profiles p
set is_superadmin = true
from public.app_roles r
where r.data_scope = 'holding'
  and r.key = case lower(coalesce(p.perfil, ''))
        when 'admin'      then 'administrador'
        when 'manager'    then 'gerente'
        when 'franchisee' then 'franqueado'
        when 'viewer'     then '__none__'
        else lower(coalesce(p.perfil, ''))
      end;

-- 2b) Fallback: quem é admin pelo vínculo (user_unit_access holding/admin),
--     mesmo que o perfil não resolva acima.
update public.profiles p
set is_superadmin = true
where p.is_superadmin = false
  and exists (
    select 1 from public.user_unit_access ua
    where ua.user_id = p.user_id
      and ua.scope_type = 'holding'
      and ua.role = 'admin'
  );

-- 3) Conferência (rode pra ver quem ficou super-admin):
--    select p.user_id, p.full_name, p.perfil, p.is_superadmin
--    from public.profiles p where p.is_superadmin = true;
--
-- ⚠️ Antes de abrir pra clientes (Fase 1): revisar essa lista — só você (dono
--    da plataforma) deve ser super-admin. Admins de cliente entram com false.
