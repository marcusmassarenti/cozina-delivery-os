--------------------------------------------------------------------
-- 0061_platform_imports_source.sql
--
-- Distingue a ORIGEM de cada entrada no histórico de importações:
--   'report' = veio de um relatório (.xlsx) que o usuário subiu (default)
--   'api'    = veio da sincronização automática via API (99 Food)
--
-- Linhas antigas viram 'report' (o default). O sync do 99 grava 'api'.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

alter table public.platform_imports
  add column if not exists source text not null default 'report'
  check (source in ('report', 'api'));
