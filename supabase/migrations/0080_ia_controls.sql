--------------------------------------------------------------------
-- 0080_ia_controls.sql
-- Controles da camada de IA: uso diário (limite anti-gasto) + flag de
-- habilitação por conta (recurso do plano Pro).
--------------------------------------------------------------------

-- Contador de chamadas de IA por holding por dia (limitador de custo).
create table public.ia_usage (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  dia        date not null,
  chamadas   integer not null default 0,
  primary key (holding_id, dia)
);

alter table public.ia_usage enable row level security;
-- Sem policy de leitura pra usuário comum; só o service_role (server) mexe.

-- Liga/desliga a IA na conta (padrão ligado; o gate real é plano Pro + isto).
alter table public.holdings
  add column if not exists ia_habilitada boolean not null default true;

comment on column public.holdings.ia_habilitada is
  'Se a operação usa a IA (plano de ação por Claude). Recurso do plano Pro.';
