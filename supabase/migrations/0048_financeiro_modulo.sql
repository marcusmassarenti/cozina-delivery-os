--------------------------------------------------------------------
-- 0048_financeiro_modulo.sql
--
-- Módulo financeiro do dono da loja (fluxo de caixa / contas a pagar e
-- receber). Escopo por CLIENTE (holding) — cada cliente gerencia o próprio
-- caixa. Recebíveis das plataformas (iFood/99/Keeta) entram como lançamentos
-- "a receber" e podem ser CONCILIADOS: `expected_value` = informado pela
-- plataforma, `value` = efetivo recebido em conta.
--------------------------------------------------------------------

-- 1) Contas bancárias / cartões / caixa ----------------------------
create table public.fin_accounts (
  id              uuid primary key default uuid_generate_v4(),
  holding_id      uuid not null references public.holdings(id) on delete cascade,
  name            text not null,
  kind            text not null default 'conta_corrente'
                  check (kind in ('conta_corrente', 'cartao', 'dinheiro', 'outro')),
  bank            text,                       -- slug do banco p/ ícone (itau, inter, btg…)
  initial_balance numeric(14, 2) not null default 0,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);
create index fin_accounts_holding_idx on public.fin_accounts (holding_id);

-- 2) Categorias (com subcategorias via parent_id) ------------------
create table public.fin_categories (
  id          uuid primary key default uuid_generate_v4(),
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.fin_categories(id) on delete cascade,
  kind        text not null check (kind in ('despesa', 'receita')),
  icon        text,                           -- nome do ícone (lucide)
  color       text,                           -- cor opcional (hex/tailwind)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index fin_categories_holding_idx on public.fin_categories (holding_id);
create index fin_categories_parent_idx on public.fin_categories (parent_id);

-- 3) Lançamentos (despesa / receita / transferência) ---------------
create table public.fin_entries (
  id             uuid primary key default uuid_generate_v4(),
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  unit_id        uuid references public.units(id) on delete set null, -- atribuição opcional a 1 loja
  kind           text not null check (kind in ('despesa', 'receita', 'transferencia')),

  value          numeric(14, 2) not null default 0,  -- valor EFETIVO (recebido/pago em conta)
  due_date       date,                               -- vence em
  paid_date      date,                               -- efetivado em (pago/recebido em conta)

  account_id     uuid references public.fin_accounts(id) on delete set null,
  category_id    uuid references public.fin_categories(id) on delete set null,
  to_account_id  uuid references public.fin_accounts(id) on delete set null, -- destino (transferência)

  titular        text,                               -- cliente / fornecedor / colaborador
  description    text,
  tags           text[],

  -- Conciliação com plataforma de delivery
  source         text not null default 'manual'
                 check (source in ('manual', 'ifood', '99food', 'keeta')),
  expected_value numeric(14, 2),                     -- INFORMADO pela plataforma (repasse esperado)
  reconciled     boolean not null default false,     -- bateu informado × recebido?

  ref_year       integer,
  ref_month      integer check (ref_month is null or (ref_month >= 1 and ref_month <= 12)),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index fin_entries_holding_due_idx on public.fin_entries (holding_id, due_date);
create index fin_entries_holding_periodo_idx on public.fin_entries (holding_id, ref_year, ref_month);
create index fin_entries_account_idx on public.fin_entries (account_id);
create index fin_entries_category_idx on public.fin_entries (category_id);
-- Evita duplicar o mesmo recebível de plataforma ao re-sincronizar
create unique index fin_entries_source_unique_idx
  on public.fin_entries (holding_id, source, unit_id, ref_year, ref_month)
  where source <> 'manual';

-- RLS ---------------------------------------------------------------
alter table public.fin_accounts enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_entries enable row level security;

create policy "fin_accounts_select" on public.fin_accounts for select
  using (public.has_holding_access(holding_id));
create policy "fin_categories_select" on public.fin_categories for select
  using (public.has_holding_access(holding_id));
create policy "fin_entries_select" on public.fin_entries for select
  using (public.has_holding_access(holding_id));

comment on table public.fin_accounts is 'Contas/cartões do cliente p/ o módulo de fluxo de caixa.';
comment on table public.fin_categories is 'Categorias e subcategorias (parent_id) de despesa/receita.';
comment on table public.fin_entries is 'Lançamentos do caixa. Recebíveis de plataforma: expected_value (informado) × value (efetivo).';
