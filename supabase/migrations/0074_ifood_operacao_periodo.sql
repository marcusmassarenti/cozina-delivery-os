--------------------------------------------------------------------
-- 0074_ifood_operacao_periodo.sql
-- Indicadores de OPERAÇÃO do iFood (relatório "Qualidade da operação").
--
-- O XLSX vem 1 linha por (loja, DIA) — no modo rede, todas as lojas num
-- arquivo só. Aqui guardamos 1 linha por (unidade, period_start, period_end)
-- já AGREGADA (contagens somadas, percentuais recompostos/ponderados).
--
-- É a fonte dos dados que a API pública do iFood NÃO expõe:
-- tempo online, chamados/negociações, ranqueamento (Nível super),
-- tempo de preparo, atrasos e motivos de cancelamento.
--------------------------------------------------------------------

create table public.ifood_operacao_periodo (
  id                          uuid primary key default uuid_generate_v4(),
  unit_id                     uuid not null references public.units(id) on delete cascade,

  -- Período coberto (min/max das datas diárias da loja)
  period_start                date not null,
  period_end                  date not null,
  period_label                text not null,  -- "09/06/2026 - 08/07/2026"

  -- Ranqueamento
  nivel_super                 text,           -- "Nivel 5" / "Nao elegivel"

  -- Volume
  pedidos_totais              integer not null default 0,
  cancelamento_valor          numeric(12, 2) not null default 0,

  -- Negociações / chamados (percentuais em 0-100)
  negociacoes                 integer not null default 0,
  pct_negociacoes             numeric(6, 3),
  pct_respostas_negociacoes   numeric(6, 3),

  -- Cancelamentos
  cancelamentos               integer not null default 0,
  pct_cancelamento            numeric(6, 3),

  -- Atrasos / logística
  pedidos_atrasados           integer not null default 0,
  pct_atrasados               numeric(6, 3),
  tempo_medio_atraso_min      numeric(8, 2),
  tempo_medio_preparo_min     numeric(8, 2),
  pct_entregador_aguardo_5    numeric(6, 3),
  pct_entregador_aguardo_15   numeric(6, 3),

  -- Avaliações
  qtd_avaliacoes              integer not null default 0,
  media_avaliacoes            numeric(4, 2),

  -- Disponibilidade
  pct_tempo_online            numeric(6, 3),  -- % tempo online real vs planejado
  media_tempo_online_dia      numeric(6, 3),  -- média de tempo online por dia (%)
  tempo_pausas_min            numeric(10, 2) not null default 0,

  -- Variação vs período anterior (do próprio iFood; pode vir null)
  var_cancelamentos           numeric(8, 3),
  var_chamados                numeric(8, 3),
  var_avaliacoes              numeric(8, 3),
  var_tempo_online            numeric(8, 3),

  -- Motivos (texto agregado dos dias com ocorrência)
  top_motivos_cancelamento    text,
  top_motivos_chamados        text,

  -- Audit
  import_id                   uuid references public.platform_imports(id) on delete set null,
  imported_at                 timestamptz not null default now(),

  unique (unit_id, period_start, period_end),
  check (period_end >= period_start)
);

create index ifood_operacao_periodo_unit_idx
  on public.ifood_operacao_periodo (unit_id, period_end desc);

alter table public.ifood_operacao_periodo enable row level security;

create policy "ifood_operacao_periodo_select_with_access"
  on public.ifood_operacao_periodo for select
  using (public.has_unit_access(unit_id));
