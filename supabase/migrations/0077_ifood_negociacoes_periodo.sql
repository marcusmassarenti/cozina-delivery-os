--------------------------------------------------------------------
-- 0077_ifood_negociacoes_periodo.sql
-- Negociações e chamados do iFood (relatório "Negociações").
--
-- O XLSX vem 1 linha por negociação/pedido (sem coluna de período — a
-- janela é derivada das datas dos pedidos). Guardamos 1 linha por
-- (unidade, period_start, period_end) já agregada.
--
-- Traz o drill-down que os agregados não têm: cancelamentos EVITADOS
-- (perda evitada em R$), reembolsos, % de respostas da loja e os
-- motivos de reclamação com contagem (top_motivos JSONB).
--------------------------------------------------------------------

create table public.ifood_negociacoes_periodo (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  period_start             date not null,
  period_end               date not null,
  period_label             text not null,

  total_negociacoes        integer not null default 0,
  cancelamentos_evitados   integer not null default 0,
  valor_evitado            numeric(12, 2) not null default 0,  -- receita salva
  reembolso_total          numeric(12, 2) not null default 0,
  cupom_total              numeric(12, 2) not null default 0,
  respondidas              integer not null default 0,
  pct_respondidas          numeric(6, 3),
  impactou_super           integer not null default 0,

  -- { motivo: contagem }
  top_motivos              jsonb not null default '{}'::jsonb,

  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, period_start, period_end),
  check (period_end >= period_start)
);

create index ifood_negociacoes_periodo_unit_idx
  on public.ifood_negociacoes_periodo (unit_id, period_end desc);

alter table public.ifood_negociacoes_periodo enable row level security;

create policy "ifood_negociacoes_periodo_select_with_access"
  on public.ifood_negociacoes_periodo for select
  using (public.has_unit_access(unit_id));
