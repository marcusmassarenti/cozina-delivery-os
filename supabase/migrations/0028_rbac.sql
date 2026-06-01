--------------------------------------------------------------------
-- 0028_rbac.sql
-- Permissões configuráveis (RBAC): perfis + matriz por módulo.
--
-- Troca o modelo fixo (ROLE_CAPS hardcoded no app) por um guardado no
-- banco, editável pela tela /administracao/permissoes. As travas
-- (servidor + UI) passam a LER daqui.
--
--   app_roles          → os perfis (Administrador, Gerente, Franqueado, +custom)
--   role_module_perms  → a matriz: por perfil × módulo → ver / editar / apagar
--
-- data_scope:
--   'holding' → enxerga a rede inteira
--   'unit'    → só a(s) loja(s) vinculada(s) em user_unit_access (franqueado)
--------------------------------------------------------------------

create table if not exists public.app_roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,         -- slug estável (profiles.perfil casa com isto)
  label       text not null,
  description text,
  is_system   boolean not null default false,  -- system role não pode ser apagado pela UI
  data_scope  text not null default 'holding'
              check (data_scope in ('holding', 'unit')),
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.app_roles is
  'Perfis de acesso configuráveis. is_system=true não pode ser apagado pela UI.';

create table if not exists public.role_module_perms (
  role_id    uuid not null references public.app_roles(id) on delete cascade,
  module     text not null,                 -- dashboard, relatorios, unidades, ...
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  can_delete boolean not null default false,
  primary key (role_id, module)
);

comment on table public.role_module_perms is
  'Matriz de permissões: por perfil × módulo. As ações que não se aplicam a um módulo ficam false.';

alter table public.app_roles        enable row level security;
alter table public.role_module_perms enable row level security;

-- Leitura liberada pra qualquer usuário autenticado (o app precisa resolver as
-- próprias permissões). Escrita é só via service_role — as server actions de
-- gestão são guardadas por admin no código.
drop policy if exists app_roles_read on public.app_roles;
create policy app_roles_read on public.app_roles
  for select using (auth.role() = 'authenticated');

drop policy if exists role_module_perms_read on public.role_module_perms;
create policy role_module_perms_read on public.role_module_perms
  for select using (auth.role() = 'authenticated');

-- touch updated_at em UPDATE
create or replace function public.touch_app_roles()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_roles_touch on public.app_roles;
create trigger app_roles_touch
  before update on public.app_roles
  for each row execute function public.touch_app_roles();

--------------------------------------------------------------------
-- Seed: os 3 perfis de hoje (defaults = comportamento atual)
--------------------------------------------------------------------
insert into public.app_roles (key, label, description, is_system, data_scope, sort_order) values
  ('administrador', 'Administrador', 'Acesso total à rede. Não pode ser apagado.',   true, 'holding', 10),
  ('gerente',       'Gerente',       'Tudo menos apagar e gerir usuários/acessos.',  true, 'holding', 20),
  ('franqueado',    'Franqueado',    'Só a própria loja, leitura.',                  true, 'unit',    30)
on conflict (key) do nothing;

--------------------------------------------------------------------
-- Seed da matriz (v=ver, e=editar, d=apagar). Módulos:
--   dashboard, relatorios, avaliacoes, pedidos, unidades,
--   financeiro, importacao, usuarios, conexoes
-- Ações que não existem no módulo ficam false (ex.: editar no Dashboard).
--------------------------------------------------------------------
with perms(role_key, module, v, e, d) as (
  values
    -- Administrador: tudo que se aplica
    ('administrador', 'dashboard',  true,  false, false),
    ('administrador', 'relatorios', true,  true,  false),
    ('administrador', 'avaliacoes', true,  false, false),
    ('administrador', 'pedidos',    true,  false, false),
    ('administrador', 'unidades',   true,  true,  true ),
    ('administrador', 'financeiro', true,  true,  false),
    ('administrador', 'importacao', true,  true,  false),
    ('administrador', 'usuarios',   true,  true,  true ),
    ('administrador', 'conexoes',   true,  true,  false),
    -- Gerente: ver + editar, sem apagar, sem Usuários/Conexões
    ('gerente',       'dashboard',  true,  false, false),
    ('gerente',       'relatorios', true,  true,  false),
    ('gerente',       'avaliacoes', true,  false, false),
    ('gerente',       'pedidos',    true,  false, false),
    ('gerente',       'unidades',   true,  true,  false),
    ('gerente',       'financeiro', true,  true,  false),
    ('gerente',       'importacao', true,  true,  false),
    ('gerente',       'usuarios',   false, false, false),
    ('gerente',       'conexoes',   false, false, false),
    -- Franqueado: só ver (na própria loja), nada de editar/apagar/admin
    ('franqueado',    'dashboard',  true,  false, false),
    ('franqueado',    'relatorios', true,  false, false),
    ('franqueado',    'avaliacoes', true,  false, false),
    ('franqueado',    'pedidos',    true,  false, false),
    ('franqueado',    'unidades',   true,  false, false),
    ('franqueado',    'financeiro', true,  false, false),
    ('franqueado',    'importacao', false, false, false),
    ('franqueado',    'usuarios',   false, false, false),
    ('franqueado',    'conexoes',   false, false, false)
)
insert into public.role_module_perms (role_id, module, can_view, can_edit, can_delete)
select r.id, p.module, p.v, p.e, p.d
from perms p
join public.app_roles r on r.key = p.role_key
on conflict (role_id, module) do nothing;
