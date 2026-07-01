--------------------------------------------------------------------
-- 0070_platform_settings.sql
-- Preço do plano padrão do self-service, editável pelo dono (super-admin) na
-- tela /plataforma — sem precisar mexer no código / redeploy.
-- Linha única (singleton id=1). Só o service_role escreve (RLS sem policy);
-- a edição passa pela action, que é gated por super-admin.
--------------------------------------------------------------------

create table if not exists public.platform_settings (
  id smallint primary key default 1,
  default_monthly_fee numeric not null default 49,
  default_price_per_unit numeric not null default 99,
  default_included_units int not null default 1,
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id = 1)
);

alter table public.platform_settings enable row level security;

insert into public.platform_settings (id) values (1)
  on conflict (id) do nothing;

comment on table public.platform_settings is
  'Configuração global da plataforma (linha única id=1). Preço do plano padrão do self-service.';
