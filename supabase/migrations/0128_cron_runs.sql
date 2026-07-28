-- Registro de execução dos crons.
--
-- Sem isto não há como distinguir "o cron rodou e não achou nada" de "o cron
-- não rodou". As duas situações produzem exatamente o mesmo silêncio no
-- banco, e a segunda é a que machuca: a plataforma pode parar de sincronizar
-- por uma semana sem nenhum sinal.

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  ok boolean,
  duracao_ms integer,
  erro text,
  resumo jsonb
);

create index if not exists cron_runs_nome_idx
  on public.cron_runs (nome, iniciado_em desc);

alter table public.cron_runs enable row level security;

comment on table public.cron_runs is
  'Uma linha por execução de cron. Alimenta o relatório diário de saúde: cron sem execução nas últimas 24h vira alerta.';

-- Defesa em profundidade, mesmo padrão da 0127: RLS sozinha já nega, mas
-- tabela nova em `public` herda grant de anon/authenticated por default do
-- Supabase. Tirar o grant faz a proteção não depender de uma única camada.
revoke all on public.cron_runs from anon, authenticated;
