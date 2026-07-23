-- Consumo e CUSTO real da IA (Nino AI) por cliente.
--
-- A contagem de mensagens já existia em ia_chat_usage (chamadas/mês), mas o
-- CUSTO depende dos tokens de cada chamada — que não eram guardados. Esta
-- tabela registra 1 linha por resposta da IA, com tokens e custo estimado
-- em USD, pra dar consumo por cliente e despesa total da plataforma.
create table if not exists public.ia_chat_custos (
  id                 uuid primary key default gen_random_uuid(),
  holding_id         uuid not null references public.holdings(id) on delete cascade,
  mes                text not null,               -- YYYY-MM (facilita agregar)
  origem             text not null default 'nino',-- nino | diagnostico | outro
  modelo             text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches       integer not null default 0,
  custo_usd          numeric(12,6) not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists ia_chat_custos_holding_mes_idx
  on public.ia_chat_custos (holding_id, mes);
create index if not exists ia_chat_custos_mes_idx
  on public.ia_chat_custos (mes);

alter table public.ia_chat_custos enable row level security;
-- Sem policies: service_role only (padrão do projeto).

comment on table public.ia_chat_custos is
  'Uma linha por resposta da IA: tokens + custo estimado (USD). Base do relatório de consumo por cliente.';
