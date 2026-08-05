--------------------------------------------------------------------
-- 0161_fk_units_on_delete.sql
--
-- Deletar unidade falhava com "violates foreign key constraint
-- cardapioweb_installs_unit_id_fkey". A action `deleteUnit()` faz um
-- `delete from units` seco e CONFIA nas regras de FK pra limpar o resto — o
-- que funciona pra iFood/Keeta, mas 9 tabelas foram criadas sem `on delete`
-- e travavam a exclusão. Sete delas são do Cardápio Web, criadas neste mês:
-- o erro é meu, de ter escrito `references units(id)` sem a regra.
--
-- A regra NÃO é a mesma pra todas, e a diferença importa:
--
--   CASCADE  → dado operacional DA loja (pedidos, itens, catálogo, clientes,
--              antecipações). O diálogo já avisa que o histórico vai junto.
--   SET NULL → CONEXÃO, que pertence ao CLIENTE e não à loja. Apagar a
--              instalação do Cardápio Web porque alguém excluiu uma unidade
--              obrigaria o lojista a autorizar tudo de novo no portal dele —
--              e o mesmo vale pro vínculo do 99. Desvincular basta.
--
-- Aplicada em prod em 05/ago/26. Depois: 0 FKs para `units` sem regra.
--------------------------------------------------------------------

alter table public.cardapioweb_pedido_itens
  drop constraint if exists cardapioweb_pedido_itens_unit_id_fkey,
  add constraint cardapioweb_pedido_itens_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

alter table public.cardapioweb_pedido_opcoes
  drop constraint if exists cardapioweb_pedido_opcoes_unit_id_fkey,
  add constraint cardapioweb_pedido_opcoes_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

alter table public.cardapioweb_pedidos
  drop constraint if exists cardapioweb_pedidos_unit_id_fkey,
  add constraint cardapioweb_pedidos_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

alter table public.cardapioweb_catalogo_itens
  drop constraint if exists cardapioweb_catalogo_itens_unit_id_fkey,
  add constraint cardapioweb_catalogo_itens_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

alter table public.cardapioweb_clientes
  drop constraint if exists cardapioweb_clientes_unit_id_fkey,
  add constraint cardapioweb_clientes_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

alter table public.ifood_antecipacoes
  drop constraint if exists ifood_antecipacoes_unit_id_fkey,
  add constraint ifood_antecipacoes_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete cascade;

-- Conexões: desvincula, não apaga.
alter table public.cardapioweb_installs
  drop constraint if exists cardapioweb_installs_unit_id_fkey,
  add constraint cardapioweb_installs_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete set null;

alter table public.cardapioweb_oauth_states
  drop constraint if exists cardapioweb_oauth_states_unit_id_fkey,
  add constraint cardapioweb_oauth_states_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete set null;

alter table public.ninefood_store_links
  drop constraint if exists ninefood_store_links_unit_id_fkey,
  add constraint ninefood_store_links_unit_id_fkey
    foreign key (unit_id) references public.units(id) on delete set null;
