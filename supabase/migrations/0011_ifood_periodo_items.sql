--------------------------------------------------------------------
-- 0011_ifood_periodo_items.sql
-- Quando Cardápio de PERÍODO traz só 1 loja, o XLSX inclui itens e
-- complementos específicos dessa loja no intervalo. Guardamos em
-- tabelas próprias pra não conflitar com o diário (que é por dia).
--
-- Quando o XLSX é multi-loja (rede inteira), itens/complementos são
-- agregados da rede — esses NÃO ficam aqui (são ignorados na gravação).
--------------------------------------------------------------------

create table public.ifood_cardapio_periodo_items (
  id                    uuid primary key default uuid_generate_v4(),
  unit_id               uuid not null references public.units(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  categoria             text,
  nome_item             text not null,
  visitas               integer not null default 0,
  pedidos               integer not null default 0,
  conversao_pct         numeric(6, 3),
  qtd_vendida           integer not null default 0,
  qtd_com_promocao      integer not null default 0,
  pedidos_com_promocao  integer not null default 0,
  valor_total           numeric(12, 2) not null default 0,
  import_id             uuid references public.platform_imports(id) on delete set null,
  imported_at           timestamptz not null default now(),
  unique (unit_id, period_start, period_end, nome_item)
);

create index ifood_periodo_items_idx
  on public.ifood_cardapio_periodo_items (unit_id, period_end desc);

alter table public.ifood_cardapio_periodo_items enable row level security;

create policy "ifood_periodo_items_select_with_access"
  on public.ifood_cardapio_periodo_items for select
  using (public.has_unit_access(unit_id));


create table public.ifood_cardapio_periodo_complementos (
  id                uuid primary key default uuid_generate_v4(),
  unit_id           uuid not null references public.units(id) on delete cascade,
  period_start      date not null,
  period_end        date not null,
  classificacao     text,
  nome_complemento  text not null,
  lojas             integer,
  pedidos           integer not null default 0,
  qtd_vendida       integer not null default 0,
  valor_total       numeric(12, 2) not null default 0,
  import_id         uuid references public.platform_imports(id) on delete set null,
  imported_at       timestamptz not null default now()
);

-- Classificação nullable: usamos coalesce no UNIQUE pra evitar duplicação
-- (mesmo padrão da migration 0008).
create unique index ifood_periodo_complementos_uniq
  on public.ifood_cardapio_periodo_complementos (
    unit_id,
    period_start,
    period_end,
    coalesce(classificacao, ''),
    nome_complemento
  );

create index ifood_periodo_complementos_idx
  on public.ifood_cardapio_periodo_complementos (unit_id, period_end desc);

alter table public.ifood_cardapio_periodo_complementos enable row level security;

create policy "ifood_periodo_complementos_select_with_access"
  on public.ifood_cardapio_periodo_complementos for select
  using (public.has_unit_access(unit_id));
