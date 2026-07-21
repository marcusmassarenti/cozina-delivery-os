--------------------------------------------------------------------
-- 0105_cardapioweb_erro_detalhe.sql
--
-- Marca falha ao detalhar um pedido, incrementando o contador de
-- tentativas no próprio UPDATE (sem ler-antes-de-escrever, que perderia
-- contagem se dois jobs rodarem juntos).
--
-- Depois de 3 tentativas o pedido sai da fila (`detalhar_pendentes` filtra
-- por detalhe_tentativas < 3). Isso evita que um pedido problemático —
-- apagado no Cardápio Web, corrompido, o que for — trave o backfill inteiro
-- num laço infinito.
--------------------------------------------------------------------

create or replace function public.cardapioweb_marcar_erro_detalhe(
  p_pedido_id uuid,
  p_erro      text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.cardapioweb_pedidos
     set detalhe_tentativas = detalhe_tentativas + 1,
         detalhe_erro       = p_erro,
         synced_at          = now()
   where id = p_pedido_id;
$$;

revoke execute on function public.cardapioweb_marcar_erro_detalhe(uuid, text)
  from public, anon, authenticated;
