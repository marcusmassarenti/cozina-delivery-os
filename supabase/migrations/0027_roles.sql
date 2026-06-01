--------------------------------------------------------------------
-- 0027_roles.sql
-- Modelo de papéis (admin / gerente / franqueado) pro controle de acesso.
--
-- O papel vem de profiles.perfil (texto). Convenção:
--   'administrador' → admin       (pode tudo)
--   'gerente'       → gerente      (tudo MENOS apagar e gerir acessos/usuários)
--   'franqueado'    → franqueado   (só leitura, e só a própria loja)
-- Valores fora do padrão (ex: 'viewer') caem em franqueado (mais restrito).
--
-- Esta seção SÓ define o papel — não muda comportamento ainda. As travas
-- (servidor, RLS, UI) vêm nas próximas seções.
--------------------------------------------------------------------

create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1º: profiles.perfil
    case lower(coalesce(
      (select perfil from public.profiles where user_id = auth.uid()), ''))
      when 'administrador' then 'admin'
      when 'admin'         then 'admin'
      when 'gerente'       then 'gerente'
      when 'manager'       then 'gerente'
      when 'franqueado'    then 'franqueado'
      else null
    end,
    -- 2º: fallback pelo escopo em user_unit_access
    case
      when exists (
        select 1 from public.user_unit_access
        where user_id = auth.uid()
          and scope_type = 'holding' and role = 'admin'
      ) then 'admin'
      when exists (
        select 1 from public.user_unit_access
        where user_id = auth.uid()
          and scope_type in ('holding', 'brand')
      ) then 'gerente'
      else 'franqueado'
    end
  );
$$;

comment on function public.app_role() is
  'Papel do usuário logado: admin | gerente | franqueado. Base do controle de acesso (RLS + app).';
