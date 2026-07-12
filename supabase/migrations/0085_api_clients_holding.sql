-- 0085 · Segurança: amarra cada chave de API a uma empresa (holding)
--
-- A API pública /api/v1 autenticava por chave, mas a chave não era vinculada a
-- nenhum tenant e os endpoints devolviam dados da REDE INTEIRA. Ou seja: uma
-- chave emitida pro cliente A retornava faturamento/lojas/demanda de TODOS.
--
-- Agora cada chave pertence a uma holding; os endpoints escopam os dados às
-- lojas dessa holding. Chave sem holding_id é recusada (fail-closed no código).
-- Hoje não há nenhuma chave emitida (api_clients vazio), então sem backfill.

alter table public.api_clients
  add column if not exists holding_id uuid references public.holdings(id) on delete cascade;

create index if not exists api_clients_holding_id_idx on public.api_clients(holding_id);
