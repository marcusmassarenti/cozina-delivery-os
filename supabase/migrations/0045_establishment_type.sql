--------------------------------------------------------------------
-- Tipo de estabelecimento do cliente (holding)
--
-- Ex.: Restaurante, Delivery próprio, Franquia, Outro. Texto livre/rótulo.
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists establishment_type text;
