--------------------------------------------------------------------
-- Onboarding — tour de boas-vindas no 1º login
--
-- Flag por usuário pra mostrar o tour só uma vez. Usuários ATUAIS já
-- conhecem o sistema → marcados como onboarded=true no backfill (não veem
-- o tour). Usuários novos (clientes) entram com false → veem o tour.
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- Backfill: quem já existe não vê o tour.
update public.profiles set onboarded = true where onboarded = false;
