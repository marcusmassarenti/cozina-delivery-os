--------------------------------------------------------------------
-- 0106_cardapioweb_clientes_cursor.sql
--
-- Cursor da varredura de clientes.
--
-- Diferente dos pedidos, a listagem de clientes NÃO aceita filtro por
-- data — só paginação (50 por página, máx). Ou seja: não existe
-- "incremental", toda atualização é uma varredura do começo.
--
-- Numa loja pequena isso é irrelevante (217 clientes = 5 páginas). Numa
-- base de 50 mil vira 1.000 chamadas, o que não cabe numa execução. Por
-- isso guardamos em que página paramos: cada rodada avança um pedaço e,
-- ao chegar no fim, volta pra página 1 pra manter o cadastro fresco
-- (pontos de fidelidade e cashback mudam sozinhos).
--------------------------------------------------------------------

alter table public.cardapioweb_sync_state
  add column if not exists clientes_pagina int not null default 1;

alter table public.cardapioweb_sync_state
  add column if not exists clientes_total int;

alter table public.cardapioweb_sync_state
  add column if not exists clientes_ultima_volta timestamptz;

comment on column public.cardapioweb_sync_state.clientes_pagina is
  'Próxima página a buscar. Volta pra 1 quando termina a varredura.';
comment on column public.cardapioweb_sync_state.clientes_ultima_volta is
  'Quando a última varredura completa terminou.';
