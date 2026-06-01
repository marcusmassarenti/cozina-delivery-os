--------------------------------------------------------------------
-- 0029_rbac_admin_full.sql
-- A matriz agora expõe ver/editar/apagar em TODOS os módulos. Esta migration
-- normaliza (reset canônico) os 3 perfis de SISTEMA pros defaults corretos:
--
--   Administrador → acesso total (tudo true em todos os módulos).
--   Gerente       → ver+editar nos módulos operacionais; sem apagar; sem
--                   Usuários/Conexões.
--   Franqueado    → só ver nos módulos operacionais; nada de admin/importação.
--
-- Perfis CUSTOM (is_system=false) não são tocados. Idempotente.
--------------------------------------------------------------------

with canon(role_key, module, v, e, d) as (
  values
    -- Administrador: acesso total
    ('administrador', 'dashboard',  true, true,  true ),
    ('administrador', 'relatorios', true, true,  true ),
    ('administrador', 'avaliacoes', true, true,  true ),
    ('administrador', 'pedidos',    true, true,  true ),
    ('administrador', 'unidades',   true, true,  true ),
    ('administrador', 'financeiro', true, true,  true ),
    ('administrador', 'importacao', true, true,  true ),
    ('administrador', 'usuarios',   true, true,  true ),
    ('administrador', 'conexoes',   true, true,  true ),
    -- Gerente: ver + editar (operacional), sem apagar, sem Usuários/Conexões
    ('gerente',       'dashboard',  true,  false, false),
    ('gerente',       'relatorios', true,  true,  false),
    ('gerente',       'avaliacoes', true,  false, false),
    ('gerente',       'pedidos',    true,  false, false),
    ('gerente',       'unidades',   true,  true,  false),
    ('gerente',       'financeiro', true,  true,  false),
    ('gerente',       'importacao', true,  true,  false),
    ('gerente',       'usuarios',   false, false, false),
    ('gerente',       'conexoes',   false, false, false),
    -- Franqueado: só ver (operacional), nada de editar/apagar/admin
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
update public.role_module_perms p
set can_view = c.v, can_edit = c.e, can_delete = c.d
from canon c
join public.app_roles r on r.key = c.role_key
where p.role_id = r.id and p.module = c.module;
