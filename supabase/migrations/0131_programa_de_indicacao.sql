-- Programa de indicação.
--
-- Quem indica ganha % da mensalidade do indicado, pago por Pix todo mês.
-- Quem é indicado ganha desconto na primeira fatura.
--
-- O indicador NÃO precisa ser cliente: como o pagamento é Pix por fora, um
-- consultor ou parceiro pode indicar sem ter conta aqui. Quando ele TAMBÉM é
-- cliente (caso do Diego, da DG Foods), holding_id aponta pra empresa dele.

create table if not exists public.indicadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Código que o indicado digita no cadastro (ou vem em ?ref=). Comparado em
  -- maiúsculas: ninguém digita cupom com o mesmo capricho duas vezes.
  codigo text not null unique,
  pix_chave text,
  contato text,
  comissao_pct numeric(5,2) not null default 20,
  desconto_pct numeric(5,2) not null default 50,
  ativo boolean not null default true,
  holding_id uuid references public.holdings(id) on delete set null,
  nota text,
  criado_em timestamptz not null default now()
);

create index if not exists indicadores_codigo_idx on public.indicadores (upper(codigo));

-- Quem indicou cada cliente. Fica na holding porque é atributo dela, e assim
-- não há como um cliente ter dois indicadores brigando pela comissão.
alter table public.holdings
  add column if not exists indicado_por uuid references public.indicadores(id) on delete set null,
  add column if not exists indicado_em timestamptz,
  add column if not exists desconto_primeira_fatura_pct numeric(5,2);

create table if not exists public.comissoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.indicadores(id) on delete cascade,
  holding_id uuid not null references public.holdings(id) on delete cascade,
  competencia text not null,
  base_valor numeric(10,2) not null,
  pct numeric(5,2) not null,
  valor numeric(10,2) not null,
  status text not null default 'a_pagar'
    check (status in ('a_pagar', 'paga', 'cancelada')),
  pago_em date,
  nota text,
  criado_em timestamptz not null default now()
);

-- Trava de duplicidade: rodar a apuração duas vezes não gera comissão dobrada.
create unique index if not exists comissoes_unica
  on public.comissoes (indicador_id, holding_id, competencia)
  where status <> 'cancelada';

create index if not exists comissoes_status_idx on public.comissoes (status, competencia);

alter table public.indicadores enable row level security;
alter table public.comissoes enable row level security;
revoke all on public.indicadores from anon, authenticated;
revoke all on public.comissoes from anon, authenticated;

comment on table public.indicadores is
  'Quem pode indicar clientes. Pagamento da comissão é por Pix, fora do sistema — por isso o indicador não precisa ser cliente.';
comment on table public.comissoes is
  'Comissão apurada por mês. Só nasce quando a fatura do indicado é efetivamente paga: comissão sobre fatura em aberto seria promessa, não dívida.';
