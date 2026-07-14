--------------------------------------------------------------------
-- 0091_keeta_fatura_taxas.sql
-- Taxas da Keeta agregadas por loja/mês, vindas da aba "Histórico de
-- pedidos" da Fatura consolidada (bill-…). É a quebra OFICIAL do que a
-- Keeta cobrou — usada pra detalhar a linha da Keeta na DRE.
--
-- ADITIVO: nunca muda o total da taxa (que vem de bruto − líquido dos
-- relatórios base). Só enriquece a abertura. Sem Fatura, a DRE cai no
-- "Pedidos recentes" e depois em "Cancelamentos / outros".
--------------------------------------------------------------------

create table public.keeta_fatura_taxas (
  id                    uuid primary key default uuid_generate_v4(),
  unit_id               uuid not null references public.units(id) on delete cascade,

  ref_year              integer not null,
  ref_month             integer not null check (ref_month >= 1 and ref_month <= 12),

  -- Custos (positivos) — a Fatura traz negativo; o parser normaliza.
  comissao              numeric(14, 2),   -- "Comissão básica"
  taxa_distancia        numeric(14, 2),   -- "Taxa adicional de distância"
  taxa_pagamento_online numeric(14, 2),   -- "Taxa de pagamento online"
  taxa_saque_antecipado numeric(14, 2),   -- "Taxa de saque antecipado"
  taxa_servico_mensal   numeric(14, 2),   -- "Taxa de serviço mensal"
  promo_loja            numeric(14, 2),   -- promo do item + entrega bancados pela loja
  publicidade           numeric(14, 2),   -- publicidade + marketing inteligente
  ajuste_comissao       numeric(14, 2),   -- "Ajuste de comissão"
  deducao_ajuda         numeric(14, 2),   -- "Dedução pelo serviço da Ajuda"
  pedidos               integer,

  import_id             uuid references public.platform_imports(id) on delete set null,
  imported_at           timestamptz not null default now(),

  unique (unit_id, ref_year, ref_month)
);

create index keeta_fatura_taxas_unit_ref_idx
  on public.keeta_fatura_taxas (unit_id, ref_year, ref_month);

alter table public.keeta_fatura_taxas enable row level security;

create policy "keeta_fatura_taxas_select_with_access"
  on public.keeta_fatura_taxas for select
  using (public.has_unit_access(unit_id));
