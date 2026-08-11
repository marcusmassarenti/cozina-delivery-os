-- Horário programado da loja no iFood, por dia da semana.
--
-- Vem de GET /merchant/v1.0/merchants/{id}/opening-hours, que JÁ FUNCIONA com
-- o app que temos homologado — não depende do módulo Order (que exigiria
-- assumir a operação do pedido).
--
-- Responde duas perguntas que a operação faz e ninguém tinha:
--   • quantas horas por semana a loja fica aberta;
--   • em que dias ela simplesmente não abre.
--
-- O segundo caso importa mais do que parece: o relatório de dia da semana
-- ADIVINHAVA isso (dia com menos de 15% da média diária = "não opera"). Com o
-- horário oficial, para de adivinhar.
--
-- ⚠️ É o PROGRAMADO, não o realizado. Loja pode estar programada 5h e ficar
-- offline metade do tempo — quem diz isso é `pct_tempo_online`, do relatório
-- de Qualidade. Uma coisa não substitui a outra.

create table if not exists public.ifood_horarios (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  -- 0=domingo … 6=sábado, igual ao extract(dow) do Postgres. A API manda
  -- MONDAY/TUESDAY/…; a conversão fica no código, não aqui.
  dow smallint not null check (dow between 0 and 6),
  hora_inicio time not null,
  duracao_min integer not null check (duracao_min > 0),
  shift_id text,
  sincronizado_em timestamptz not null default now(),
  unique (unit_id, dow, hora_inicio)
);

comment on table public.ifood_horarios is
  'Turnos programados da loja no iFood (opening-hours). PROGRAMADO, não realizado.';

create index if not exists ifood_horarios_unit_idx on public.ifood_horarios (unit_id);

alter table public.ifood_horarios enable row level security;

-- Leitura pelo mesmo escopo das outras tabelas da unidade. Escrita é só do
-- service_role (o sync), que ignora RLS.
drop policy if exists ifood_horarios_select on public.ifood_horarios;
create policy ifood_horarios_select on public.ifood_horarios
  for select using (public.has_unit_access(unit_id));
