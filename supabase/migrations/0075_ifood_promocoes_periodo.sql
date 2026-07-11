--------------------------------------------------------------------
-- 0075_ifood_promocoes_periodo.sql
-- Investimento e retorno de PROMOÇÕES do iFood (relatório "Promoções").
--
-- O XLSX vem 1 linha por (loja × campanha) — no modo rede, todas as lojas.
-- Aqui guardamos 1 linha por (unidade, period_start, period_end) já somada.
--
-- Fonte confiável do "% de marketing sobre o faturamento" (investimento_lojas)
-- e do ROI das campanhas — melhor que a soma de promoções da Conciliação.
--
-- Obs.: pedidos e valor_itens podem CONTAR EM DOBRO quando um pedido cai em
-- 2 campanhas combinadas (o iFood repete a linha). Por isso o número âncora é
-- investimento_lojas (cada gasto de campanha é distinto, não duplica).
--------------------------------------------------------------------

create table public.ifood_promocoes_periodo (
  id                       uuid primary key default uuid_generate_v4(),
  unit_id                  uuid not null references public.units(id) on delete cascade,

  period_start             date not null,
  period_end               date not null,
  period_label             text not null,

  n_campanhas              integer not null default 0,
  pedidos                  integer not null default 0,  -- pode duplicar em combos
  valor_itens              numeric(12, 2) not null default 0,

  -- Investimentos (R$)
  investimento_total       numeric(12, 2) not null default 0,
  investimento_lojas       numeric(12, 2) not null default 0,  -- âncora do % marketing
  investimento_rede        numeric(12, 2) not null default 0,
  investimento_ifood       numeric(12, 2) not null default 0,
  investimento_industria   numeric(12, 2) not null default 0,

  -- ROI aproximado (valor_itens / investimento_lojas)
  roas_lojas               numeric(8, 3),

  import_id                uuid references public.platform_imports(id) on delete set null,
  imported_at              timestamptz not null default now(),

  unique (unit_id, period_start, period_end),
  check (period_end >= period_start)
);

create index ifood_promocoes_periodo_unit_idx
  on public.ifood_promocoes_periodo (unit_id, period_end desc);

alter table public.ifood_promocoes_periodo enable row level security;

create policy "ifood_promocoes_periodo_select_with_access"
  on public.ifood_promocoes_periodo for select
  using (public.has_unit_access(unit_id));
