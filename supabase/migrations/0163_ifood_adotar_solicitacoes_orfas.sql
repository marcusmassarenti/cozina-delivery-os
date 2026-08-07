--------------------------------------------------------------------
-- 0163_ifood_adotar_solicitacoes_orfas.sql
--
-- Um pedido de conexão iFood pode nascer com `unit_id` NULO. O auto-vínculo lia
-- as solicitações com `units!inner`, então esses pedidos eram DESCARTADOS pelo
-- join: o botão "conferir e vincular" nem testava a loja, e a tela não dizia
-- nada — nem sucesso, nem erro. Ficaria assim pra sempre.
--
-- Aconteceu com a Vbfood (Le Petit Pastéis) em 07/ago/26: pedido com o CNPJ
-- certo, unidade cadastrada com o MESMO CNPJ, e invisível pro sistema inteiro.
--
-- Adota o pedido órfão pela unidade de mesmo CNPJ, dentro da MESMA holding.
-- Nunca entre clientes: vincular a loja de outro dono misturaria faturamento,
-- que é o pior erro possível aqui.
--
-- Sem CNPJ no pedido, não adota: sem chave, adivinhar a loja seria pior que
-- deixar pendente.
--------------------------------------------------------------------
create or replace function public.ifood_adotar_solicitacoes_orfas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update ifood_activation_requests r
  set unit_id = u.id, updated_at = now()
  from units u
  join brands b on b.id = u.brand_id
  where r.unit_id is null
    and r.status in ('pendente', 'solicitada')
    and b.holding_id = r.holding_id
    and regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g') <> ''
    and regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g')
      = regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ⚠️ `create or replace` NÃO preserva grants — repetir sempre.
revoke all on function public.ifood_adotar_solicitacoes_orfas() from public, anon;
grant execute on function public.ifood_adotar_solicitacoes_orfas() to service_role;
