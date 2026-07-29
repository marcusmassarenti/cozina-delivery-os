-- Keeta entra no mesmo padrão do iFood e da 99.
--
-- A régua veio de prova, não de suposição. Em 6 pedidos aleatórios, a conta
--   valor_pago_cliente = preco_original − promo_loja − promo_keeta
--                        + taxa_entrega + 0,99
-- fechou 6 de 6, sempre com a mesma sobra de R$ 0,99 (taxa de serviço fixa).
-- Isso PROVA que na Keeta quem paga o frete é o CLIENTE.
--
-- Logo, os dois campos são coisas diferentes:
--   taxa_entrega   (R$ 5,99 a 17,99) → frete, pago pelo cliente
--   taxa_distancia (R$ 3,50 ou 6,50) → adicional cobrado da LOJA, todo pedido
--
-- Com isso a Keeta fica comparável: "a loja bancou" são os pedidos com frete
-- zerado pro cliente, e a taxa de distância vai como custo_extra — uma
-- cobrança que o iFood e a 99 simplesmente não têm.

drop function if exists public.quem_paga_entrega(uuid[], date, date);

create or replace function public.quem_paga_entrega(
  p_unit_ids uuid[], p_inicio date, p_fim date
)
returns table (
  plataforma text, pedidos bigint, loja_bancou bigint, cliente_pagou bigint,
  sem_info bigint, valor_bancado_pela_loja numeric,
  valor_pago_pelo_cliente numeric, custo_total_entrega numeric,
  custo_extra numeric, custo_extra_label text
)
language sql security definer set search_path to 'public'
as $$
  with ifood_ped as (
    select f.unit_id, f.pedido_associado_ifood as ped,
           sum(abs(f.valor)) filter (where f.descricao_lancamento='Taxa entrega iFood') as custo,
           sum(abs(f.valor)) filter (where f.descricao_lancamento='Promoção custeada pela loja no delivery') as bancou
      from ifood_financeiro_lancamentos f
     where f.unit_id = any(p_unit_ids) and f.data_fato_gerador >= p_inicio
       and f.data_fato_gerador < (p_fim + 1) and f.pedido_associado_ifood is not null
     group by 1,2
  )
  select 'ifood'::text, count(*) filter (where custo > 0),
         count(*) filter (where coalesce(bancou,0) > 0),
         count(*) filter (where custo > 0 and coalesce(bancou,0) = 0),
         0::bigint, coalesce(sum(bancou),0),
         greatest(coalesce(sum(custo),0) - coalesce(sum(bancou),0), 0),
         coalesce(sum(custo),0), 0::numeric, null::text
    from ifood_ped
  union all
  select '99food', count(*),
         count(*) filter (where coalesce(p.custo_loja_oferta_entrega_gratis,0) > 0),
         count(*) filter (where coalesce(p.taxa_entrega_original,0) > 0
                            and coalesce(p.custo_loja_oferta_entrega_gratis,0) = 0),
         count(*) filter (where coalesce(p.taxa_entrega_original,0) = 0
                            and coalesce(p.custo_loja_oferta_entrega_gratis,0) = 0),
         coalesce(sum(p.custo_loja_oferta_entrega_gratis),0),
         coalesce(sum(p.taxa_entrega_original),0),
         coalesce(sum(p.custo_loja_oferta_entrega_gratis),0) + coalesce(sum(p.custos_logisticos),0),
         0::numeric, null::text
    from ninefood_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim
  union all
  select 'keeta',
         (select count(*) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim),
         (select count(*) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim
             and coalesce(k.taxa_entrega,0) = 0),
         (select count(*) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim
             and coalesce(k.taxa_entrega,0) > 0),
         0::bigint, 0::numeric,
         (select coalesce(sum(k.taxa_entrega),0) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim),
         coalesce(sum(abs(r.taxa_distancia)),0),
         coalesce(sum(abs(r.taxa_distancia)),0),
         'taxa de distância'::text
    from keeta_pedidos_recentes r
   where r.unit_id = any(p_unit_ids) and r.data between p_inicio and p_fim;
$$;

comment on function public.quem_paga_entrega(uuid[], date, date) is
  'Quem banca a entrega por pedido, nas 3 plataformas no mesmo padrão. Na Keeta o cliente paga o frete (provado pela conta do valor pago) e a taxa de distância é custo extra da loja.';

revoke all on function public.quem_paga_entrega(uuid[], date, date) from public, anon, authenticated;
