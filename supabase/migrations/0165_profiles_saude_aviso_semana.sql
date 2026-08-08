-- Semana em que o usuário viu o aviso de saúde das lojas ("2026-W32").
--
-- Fica no BANCO e não no localStorage pela mesma razão do last_seen_version:
-- localStorage é por navegador, então o aviso voltaria em outro device e
-- sempre que o browser limpasse os dados do site.
--
-- Guarda a SEMANA (ISO, segunda a domingo) e não uma data: assim a regra
-- "1x por semana, toda segunda" é uma comparação de igualdade, sem conta de
-- fuso nem de "faz 7 dias".
alter table public.profiles
  add column if not exists saude_aviso_semana text;

comment on column public.profiles.saude_aviso_semana is
  'Semana ISO (YYYY-Www) em que o usuário viu o aviso semanal de saúde das lojas.';
