--------------------------------------------------------------------
-- 0079_diagnostico_ia.sql
-- Plano de ação gerado por IA (Claude) pra aba Diagnóstico.
--
-- Gerado SOB DEMANDA (botão) e cacheado por (unidade, ano, mês). O
-- `input_hash` guarda a assinatura dos dados usados — se os dados mudarem
-- (nova importação), a UI sabe que o plano está desatualizado e oferece
-- regenerar. Evita reprocessar (e gastar tokens) a cada abertura.
--------------------------------------------------------------------

create table public.diagnostico_ia (
  id           uuid primary key default uuid_generate_v4(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  ano          integer not null,
  mes          integer not null check (mes between 1 and 12),

  input_hash   text not null,
  resumo       text,                          -- 1 frase de foco prioritário
  acoes        jsonb not null default '[]'::jsonb, -- [{titulo, problema, em_jogo, como_fazer, severidade}]
  modelo       text,

  gerado_em    timestamptz not null default now(),
  gerado_por   uuid,

  unique (unit_id, ano, mes)
);

create index diagnostico_ia_unit_idx
  on public.diagnostico_ia (unit_id, ano desc, mes desc);

alter table public.diagnostico_ia enable row level security;

create policy "diagnostico_ia_select_with_access"
  on public.diagnostico_ia for select
  using (public.has_unit_access(unit_id));
