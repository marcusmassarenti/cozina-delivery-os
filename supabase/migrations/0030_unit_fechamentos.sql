--------------------------------------------------------------------
-- 0030_unit_fechamentos.sql
-- Fechamento de sociedade (acerto 50/50) — começa só no JK.
--
-- Cada linha = um fechamento semanal de uma unidade:
--   Recebido das plataformas (− custos manuais) = Lucro líquido ÷ 2.
-- Lucro líquido e a metade NÃO são colunas — derivam no app (recebido −
-- custos), pra nunca ficar inconsistente.
--
-- O bloco de "acerto/repasse" (Valor Churrasco no Pote, para Pibus, Desconto
-- CNPão, Legumes, VR) fica em JSONB livre por enquanto — estruturamos depois
-- que o Marcus explicar a lógica exata.
--------------------------------------------------------------------

create table if not exists public.unit_fechamentos (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  periodo_inicio  date not null,
  periodo_fim     date not null,

  -- 1) Recebido das plataformas (pré-preenchido automático, editável)
  recebido_ifood  numeric not null default 0,
  recebido_keeta  numeric not null default 0,
  recebido_99     numeric not null default 0,
  credito_debito  numeric not null default 0,  -- crédito/débito da semana

  -- 2) Custos da operação (manual)
  custo_produtos   numeric not null default 0, -- CMV consumido do Cozina
  custo_vinagrete  numeric not null default 0, -- vinagrete/maionese/bebidas

  -- 4) Acerto / repasse (livre por enquanto)
  acerto       jsonb not null default '{}'::jsonb,
  observacoes  text,

  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (unit_id, periodo_inicio, periodo_fim)
);

comment on table public.unit_fechamentos is
  'Fechamento de sociedade (acerto 50/50) por unidade e semana. Hoje só JK.';

create index if not exists unit_fechamentos_unit_periodo_idx
  on public.unit_fechamentos (unit_id, periodo_inicio desc);

alter table public.unit_fechamentos enable row level security;

-- Leitura: quem tem acesso à unidade (segue o padrão das outras tabelas).
drop policy if exists unit_fechamentos_select_with_access on public.unit_fechamentos;
create policy unit_fechamentos_select_with_access
  on public.unit_fechamentos for select
  using (has_unit_access(unit_id));

-- Escrita só via service_role (as server actions são guardadas no app).

-- touch updated_at
create or replace function public.touch_unit_fechamentos()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists unit_fechamentos_touch on public.unit_fechamentos;
create trigger unit_fechamentos_touch
  before update on public.unit_fechamentos
  for each row execute function public.touch_unit_fechamentos();
