-- Keeta entra na conta de quem banca a entrega.
--
-- A 0134 devolvia zero pra Keeta e a tela dizia "não medimos". Estava errado
-- por omissão: a "Taxa adicional de distância" É custo de entrega pago pela
-- LOJA, e vem em 100% dos pedidos (R$ 31.819 em julho, R$ 5,48 por pedido).
--
-- Dois detalhes que escondiam o dado:
--   1. Vive em keeta_pedidos_recentes, não em keeta_pedidos.
--   2. Vem com sinal NEGATIVO, como toda despesa da Keeta — um filtro
--      "> 0" devolvia zero linha e parecia ausência de dado.
--
-- Na Keeta as duas coisas convivem no mesmo pedido: o cliente paga o frete E
-- a loja leva a taxa de distância. Não é um ou outro, então a tela mostra os
-- dois lados em vez de uma barra de disputa.

drop function if exists public.quem_paga_entrega(uuid[], date, date);

create or replace function public.quem_paga_entrega(
  p_unit_ids uuid[], p_inicio date, p_fim date
)
returns table (
  plataforma text, pedidos bigint, loja_bancou bigint, cliente_pagou bigint,
  sem_info bigint, valor_bancado_pela_loja numeric,
  valor_pago_pelo_cliente numeric, custo_total_entrega numeric
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
         coalesce(sum(custo),0)
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
         coalesce(sum(p.custo_loja_oferta_entrega_gratis),0) + coalesce(sum(p.custos_logisticos),0)
    from ninefood_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim
  union all
  select 'keeta', count(*),
         count(*) filter (where coalesce(r.taxa_distancia,0) <> 0),
         (select count(*) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim
             and coalesce(k.taxa_entrega,0) > 0),
         0::bigint,
         coalesce(sum(abs(r.taxa_distancia)),0),
         (select coalesce(sum(k.taxa_entrega),0) from keeta_pedidos k
           where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim),
         coalesce(sum(abs(r.taxa_distancia)),0)
    from keeta_pedidos_recentes r
   where r.unit_id = any(p_unit_ids) and r.data between p_inicio and p_fim;
$$;

comment on function public.quem_paga_entrega(uuid[], date, date) is
  'Quem banca a entrega por pedido, nas 3 plataformas. Na Keeta a taxa de distância é custo da loja e vem negativa em keeta_pedidos_recentes.';

revoke all on function public.quem_paga_entrega(uuid[], date, date) from public, anon, authenticated;
