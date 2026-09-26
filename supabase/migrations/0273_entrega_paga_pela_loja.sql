/*
 * "Custo de entrega" = o que a LOJA pagou de entrega (Marcus, 25/09/26).
 *
 * O card somava a entrega parceira do iFood e o frete da Keeta — as duas
 * pagas pelo CLIENTE (vêm dentro do que ele pagou; o iFood marca a dele como
 * informativa, e o frete da Keeta nem entra na conta do repasse). No CnP de
 * set/26: R$ 130,8 mil "de custo de entrega", dos quais R$ 117 mil eram do
 * cliente. E o DRE, desde a correção das taxas (a7f40c8), já não conta essa
 * entrega como custo da loja — o card precisava falar a mesma língua.
 *
 * Por plataforma, só o que saiu do bolso da loja:
 *  - iFood : "Promoção custeada pela loja no delivery" (frete grátis bancado),
 *            somada COM SINAL — o cancelamento estorna na linha positiva;
 *  - 99    : entrega cobrada da loja + frete grátis bancado (planilha:
 *            custo logístico + oferta de entrega grátis; API: b2pDelivery +
 *            freeDeliveryOutcome − freeDeliverySubsidy). Mesma régua de antes
 *            — a do 99 já era custo da loja;
 *  - Keeta : taxa de distância (pedidos recentes), cobrada da loja.
 *
 * Mês cheio: filtra por competência (ref_year/ref_month) onde a tabela tem,
 * como o DRE. Recorte de dias: por data.
 */
create or replace function public.entrega_paga_pela_loja_by_units(
  p_unit_ids uuid[],
  p_year int,
  p_month int,
  p_de date default null,
  p_ate date default null
)
returns table (
  unit_id uuid,
  ifood numeric,
  ninefood_planilha numeric,
  ninefood_api numeric,
  keeta numeric
)
language sql
stable
set search_path = public
as $$
  with lim as (
    select coalesce(p_de, make_date(p_year, p_month, 1)) as de,
           coalesce(p_ate, (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date) as ate
  ),
  i as (
    select l.unit_id, -sum(l.valor) as v
    from public.ifood_financeiro_lancamentos l, lim
    where l.unit_id = any (p_unit_ids)
      and l.descricao_lancamento = 'Promoção custeada pela loja no delivery'
      and (
        (p_de is null and l.ref_year = p_year and l.ref_month = p_month)
        or (p_de is not null and l.data_fato_gerador >= lim.de and l.data_fato_gerador < lim.ate + 1)
      )
    group by l.unit_id
  ),
  np as (
    select p.unit_id,
           -- Custo logístico tem duas origens (planilha e webhook orderNew) —
           -- mesmo coalesce da 0160.
           sum(abs(coalesce(nullif(p.custos_logisticos, 0), p.custo_logistica, 0))
               + abs(coalesce(p.custo_loja_oferta_entrega_gratis, 0))) as v
    from public.ninefood_pedidos p, lim
    where p.unit_id = any (p_unit_ids)
      and (
        (p_de is null and p.ref_year = p_year and p.ref_month = p_month)
        or (p_de is not null and p.data between lim.de and lim.ate)
      )
    group by p.unit_id
  ),
  na as (
    select sl.unit_id,
           sum(
             abs(coalesce((b.raw->>'b2pDeliveryAmount')::numeric, 0))
             + abs(coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0))
             - coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
           ) / 100 as v
    from public.ninefood_api_bill b
    join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id, lim
    where sl.unit_id = any (p_unit_ids)
      and b.business_date between lim.de and lim.ate
    group by sl.unit_id
  ),
  k as (
    select r.unit_id, sum(abs(coalesce(r.taxa_distancia, 0))) as v
    from public.keeta_pedidos_recentes r, lim
    where r.unit_id = any (p_unit_ids)
      and r.data between lim.de and lim.ate
    group by r.unit_id
  ),
  ids as (
    select unit_id from i union select unit_id from np
    union select unit_id from na union select unit_id from k
  )
  select ids.unit_id,
         round(coalesce(i.v, 0), 2),
         round(coalesce(np.v, 0), 2),
         round(coalesce(na.v, 0), 2),
         round(coalesce(k.v, 0), 2)
  from ids
  left join i on i.unit_id = ids.unit_id
  left join np on np.unit_id = ids.unit_id
  left join na on na.unit_id = ids.unit_id
  left join k on k.unit_id = ids.unit_id;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.entrega_paga_pela_loja_by_units(uuid[], int, int, date, date)
  from public, anon, authenticated;
grant execute on function public.entrega_paga_pela_loja_by_units(uuid[], int, int, date, date)
  to service_role;
