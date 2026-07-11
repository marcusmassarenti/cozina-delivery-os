--------------------------------------------------------------------
-- 0076_ifood_super_avaliacao.sql
-- Avaliação do "Super restaurante" do iFood (nível/ranqueamento).
--
-- 1 linha por loja no XLSX (aba "Nível Atual") — janela de avaliação
-- trimestral (ex.: 01/04 → 30/06). Guardamos 1 por (unidade, período).
--
-- Traz o que os outros relatórios não têm: o PLANO DE AÇÃO textual do
-- próprio iFood + as TAGS DE SENTIMENTO das avaliações (o que elogiam /
-- o que reclamam), guardadas como JSONB (dimensão → contagem).
--------------------------------------------------------------------

create table public.ifood_super_avaliacao (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  period_start             date not null,
  period_end               date not null,
  period_label             text not null,   -- "01/04/2026 - 30/06/2026"

  status                   text,            -- "Nivel 5" / "Nao elegivel"
  e_super                  boolean,
  e_elegivel               boolean,

  total_pedidos            integer not null default 0,
  pedidos_avaliados        integer not null default 0,
  media_avaliacoes         numeric(4, 2),
  pct_cancelamento         numeric(6, 3),
  pct_chamados             numeric(6, 3),
  total_chamados           integer not null default 0,
  chamados_atraso          integer not null default 0,
  chamados_pos_entrega     integer not null default 0,
  chamados_item_errado     integer not null default 0,

  plano_de_acao            text,

  -- Sentimento das avaliações: { dimensão: contagem }
  tags_pos                 jsonb not null default '{}'::jsonb,
  tags_neg                 jsonb not null default '{}'::jsonb,

  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, period_start, period_end),
  check (period_end >= period_start)
);

create index ifood_super_avaliacao_unit_idx
  on public.ifood_super_avaliacao (unit_id, period_end desc);

alter table public.ifood_super_avaliacao enable row level security;

create policy "ifood_super_avaliacao_select_with_access"
  on public.ifood_super_avaliacao for select
  using (public.has_unit_access(unit_id));
