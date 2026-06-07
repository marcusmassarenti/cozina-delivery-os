--------------------------------------------------------------------
-- Fase 0 — refina o super-admin da plataforma
--
-- Decisão (Marcus): o ÚNICO super-admin da plataforma (vê TODOS os clientes
-- futuros) é o Marcus Massarenti. Os demais (admins/gerentes da Cozina) passam
-- a enxergar APENAS a Cozina — continuam vendo tudo DA COZINA, mas nada dos
-- clientes que entrarem depois.
--
-- Ordem importa: primeiro garante o vínculo de holding (senão, ao tirar o
-- super-admin, a pessoa ficaria sem ver nada), depois rebaixa.
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

-- 1) Garante vínculo com a Cozina pra TODO usuário de escopo 'holding' que
--    ainda não tenha — assim, ao perder o super-admin, ele resolve
--    holding → lojas da Cozina (vê tudo da Cozina). Idempotente.
insert into public.user_unit_access (user_id, scope_type, scope_id, role)
select p.user_id,
       'holding',
       h.id,
       case when lower(coalesce(p.perfil, '')) in ('administrador', 'admin')
            then 'admin' else 'manager' end
from public.profiles p
join public.app_roles r
  on r.data_scope = 'holding'
 and r.key = case lower(coalesce(p.perfil, ''))
       when 'admin'      then 'administrador'
       when 'manager'    then 'gerente'
       when 'franchisee' then 'franqueado'
       else lower(coalesce(p.perfil, ''))
     end,
     public.holdings h
where h.slug = 'cozina-foods'
  and not exists (
    select 1 from public.user_unit_access ua
    where ua.user_id = p.user_id
      and ua.scope_type = 'holding'
  )
on conflict (user_id, scope_type, scope_id) do nothing;

-- 2) Só o Marcus é super-admin. (user_id confirmado na conferência da 0039.)
update public.profiles
set is_superadmin = false
where user_id <> '3e2541ad-452a-4ae8-9b27-0ceb0dbf97bc';

update public.profiles
set is_superadmin = true
where user_id = '3e2541ad-452a-4ae8-9b27-0ceb0dbf97bc';

-- 3) Conferência — só o Marcus deve aparecer como super-admin, e todos os
--    holding-scope devem ter pelo menos 1 vínculo de holding:
--    select p.full_name, p.perfil, p.is_superadmin,
--           count(ua.*) filter (where ua.scope_type = 'holding') as vinc_holding
--    from public.profiles p
--    left join public.user_unit_access ua on ua.user_id = p.user_id
--    group by p.user_id, p.full_name, p.perfil, p.is_superadmin
--    order by p.is_superadmin desc, p.full_name;
