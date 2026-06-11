--------------------------------------------------------------------
-- 0059_drop_ninefood_bill.sql
--
-- Remove a tabela `ninefood_bill` (sync antigo da "Fase 3", que ficou
-- pela metade e nunca rodou — estava vazia). O sync do financeiro do 99
-- foi consolidado em `ninefood_api_bill` (migration 0058), alimentado pelo
-- card "Sincronizar 99 Food" na /importação.
--
-- A coluna unit_platforms.api_store_id (que o sync antigo usava) fica como
-- está — inofensiva. O mapeamento loja→unidade agora vive em
-- ninefood_store_links.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

drop table if exists public.ninefood_bill;
