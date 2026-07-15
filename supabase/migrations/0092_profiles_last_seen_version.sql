--------------------------------------------------------------------
-- 0092_profiles_last_seen_version.sql
-- "Já vi as novidades da versão X" passa a ser do USUÁRIO (banco), não do
-- navegador (localStorage). Motivo: localStorage é por navegador/perfil —
-- em outro device, ou se o browser limpa dados do site, o aviso voltava
-- toda vez. No banco, funciona em qualquer lugar e não volta.
--
-- Backfill: quem já usa o sistema hoje já viu a 1.2.0 (o aviso vinha
-- aparecendo insistentemente) → marca como vista. Usuário novo fica null e
-- vê a próxima release normalmente.
--------------------------------------------------------------------

alter table public.profiles
  add column if not exists last_seen_version text;

update public.profiles
  set last_seen_version = '1.2.0'
  where last_seen_version is null;

comment on column public.profiles.last_seen_version is
  'Última versão do CHANGELOG que o usuário viu no modal de novidades (ex.: 1.2.0). Null = nunca viu.';
