--------------------------------------------------------------------
-- 0047_unit_platforms_api_store_id.sql
--
-- Identificador da loja pra integração DIRETA por API, separado do
-- external_store_id.
--
-- Por quê: o external_store_id (migration 0007) guarda o ID da loja COMO ELE
-- APARECE NOS RELATÓRIOS IMPORTADOS (ex.: "ID do loja" do XLSX do 99) e é usado
-- pra casar o upload com a unidade. Já a API oficial do 99 usa um
-- app_shop_id / acceptor_code que NÓS atribuímos no bind da loja — é um
-- identificador DIFERENTE. Reusar a mesma coluna quebraria o match do import
-- manual. Então a API ganha coluna própria.
--------------------------------------------------------------------

alter table public.unit_platforms
  add column api_store_id text;

create index unit_platforms_api_store_idx
  on public.unit_platforms (platform, api_store_id)
  where api_store_id is not null;

comment on column public.unit_platforms.api_store_id is
  'ID da loja pra integração DIRETA por API (ex.: app_shop_id/acceptor_code do 99 Food). Distinto de external_store_id, que casa relatórios importados.';
