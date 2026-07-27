--------------------------------------------------------------------
-- 0121_holding_invoices.sql
--
-- Faturas da plataforma (o que foi DEVIDO), separado de holding_payments
-- (o que ENTROU).
--
-- Por que as duas coisas não são a mesma: hoje só existe o registro de
-- pagamento recebido. O que o cliente deveria ter pago e NÃO pagou não
-- existe em lugar nenhum, então não há como responder "quanto ele me
-- deve", "quantas vezes atrasou" ou "qual a inadimplência do mês" — e o
-- campo `paid` é um booleano que apaga o passado a cada renovação.
--
-- O valor é CONGELADO na emissão (valor, plano, lojas cobradas). A
-- mensalidade é por loja, então recalcular uma fatura de março com as
-- lojas de hoje mudaria o passado toda vez que o cliente abrisse uma
-- unidade nova.
--------------------------------------------------------------------

create table if not exists public.holding_invoices (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings(id) on delete cascade,

  -- Competência no formato YYYY-MM. Uma fatura por cliente por mês.
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  vencimento date not null,

  -- Memória de cálculo congelada na emissão.
  valor numeric(12,2) not null check (valor >= 0),
  plan_tier text,
  lojas_cobradas int,
  preco_negociado boolean not null default false,

  status text not null default 'aberta'
    check (status in ('aberta', 'paga', 'cancelada')),

  -- Quitação. payment_id liga na entrada correspondente do caixa.
  pago_em date,
  pago_valor numeric(12,2),
  payment_id uuid references public.holding_payments(id) on delete set null,

  -- De onde veio: cron mensal, lançada à mão, ou espelho do Asaas.
  origem text not null default 'auto'
    check (origem in ('auto', 'manual', 'asaas')),
  asaas_payment_id text,

  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma fatura por cliente por competência. É o que torna a emissão do cron
-- idempotente: rodar duas vezes no mesmo mês não duplica cobrança.
create unique index if not exists holding_invoices_unica_por_mes
  on public.holding_invoices (holding_id, competencia);

create index if not exists holding_invoices_abertas
  on public.holding_invoices (status, vencimento)
  where status = 'aberta';

comment on table public.holding_invoices is
  'Faturas devidas pelos clientes da plataforma. Complementa holding_payments '
  '(recebimentos): sem isto nao ha como medir inadimplencia nem historico de '
  'atraso, porque so o que foi pago deixava rastro.';
comment on column public.holding_invoices.valor is
  'Valor CONGELADO na emissao. Nao recalcular: a mensalidade e por loja, e '
  'recalcular mudaria o passado sempre que o cliente abrisse uma unidade.';
