--------------------------------------------------------------------
-- 0063_ifood_antecipacoes.sql
--
-- Taxa de antecipação do iFood por loja/competência.
--
-- O iFood paga a loja ~30 dias após a venda. Com a "antecipação automática"
-- ligada, ele adianta o repasse (paga semanalmente) cobrando uma taxa (~1,59%
-- por ciclo). Essa taxa NÃO vem na Conciliação (extrato) — é um endpoint à
-- parte (Anticipation API v3). O sync grava aqui o total por competência, e o
-- DRE da loja mostra "Recebido real no caixa" = líquido do repasse − esta taxa.
--
-- Idempotente: 1 linha por (unit_id, competencia); o sync faz upsert.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

create table if not exists public.ifood_antecipacoes (
  id                 bigint generated always as identity primary key,
  unit_id            uuid not null references public.units(id),
  competencia        text not null,                 -- 'YYYY-MM'
  ref_year           int  not null,
  ref_month          int  not null,
  merchant_id        text,
  fee_amount         numeric not null default 0,    -- ⭐ taxa de antecipação (R$, positivo)
  original_amount    numeric not null default 0,    -- valor original (antes de antecipar)
  anticipated_amount numeric not null default 0,    -- valor recebido antecipado
  items_count        int     not null default 0,    -- qtd de itens/ciclos antecipados
  updated_at         timestamptz not null default now()
);

-- dedupe/upsert: uma linha por (loja, competência)
create unique index if not exists ifood_antecipacoes_uniq
  on public.ifood_antecipacoes (unit_id, competencia);

-- leitura do DRE: por período
create index if not exists ifood_antecipacoes_period
  on public.ifood_antecipacoes (ref_year, ref_month);

-- Só o service_role acessa (igual ifood_financeiro_lancamentos / ninefood_api_bill);
-- o data layer lê via admin client. Sem policy pública.
alter table public.ifood_antecipacoes enable row level security;
