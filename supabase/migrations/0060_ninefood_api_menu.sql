--------------------------------------------------------------------
-- 0060_ninefood_api_menu.sql
--
-- Snapshot do CARDÁPIO do 99 puxado via API (GET /v3/item/item/list).
-- Guarda o estado atual do menu de cada loja (itens, preço, disponibilidade).
-- Sync = delete-all-da-loja + insert (snapshot do momento). app_item_id vem
-- vazio (menu criado no app do 99, não enviado por nós), então não há chave
-- estável por item — por isso snapshot, não upsert.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

create table if not exists public.ninefood_api_menu_item (
  id            bigint generated always as identity primary key,
  app_shop_id   text not null,
  position      int,                   -- ordem no menu
  item_name     text,
  category_name text,
  short_desc    text,
  price         numeric not null default 0,  -- R$ (API dá centavos)
  status        int,                   -- 1 disponível · 2 indisponível
  raw           jsonb,
  synced_at     timestamptz not null default now()
);

create index if not exists ninefood_api_menu_item_shop
  on public.ninefood_api_menu_item (app_shop_id);

alter table public.ninefood_api_menu_item enable row level security;
