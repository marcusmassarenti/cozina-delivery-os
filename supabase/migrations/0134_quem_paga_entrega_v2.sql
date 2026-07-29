-- Quem BANCOU a entrega, por pedido — corrige a 0133.
--
-- A 0133 respondia pela coluna `taxa_entrega_cliente` da planilha ("o cliente
-- foi cobrado?") e concluiu que a loja bancou 11 pedidos de 7.300 — no mesmo
-- mês em que o extrato debitou R$ 71.868 dela. A contradição era o próprio
-- erro falando: no iFood, cobrar do cliente e a loja pagar convivem no MESMO
-- pedido.
--
-- Fonte certa é o extrato, que separa as duas coisas:
--   "Taxa entrega iFood"                      → custo da entrega
--   "Promoção custeada pela loja no delivery" → a loja bancou aquela entrega
-- Com a régua certa: 4.894 de 7.380 (66%), não 11.
--
-- Bônus: o extrato cobre o mês inteiro, então some a lacuna dos pedidos que
-- entram pela API sem a taxa do cliente.
--
-- Na 99, o equivalente é `custo_loja_oferta_entrega_gratis` no pedido.
-- Na Keeta NÃO existe campo que diga quem bancou — ali a função devolve zero
-- em loja_bancou e a tela é obrigada a dizer que não mede, em vez de exibir
-- "0%" e afirmar que a loja nunca pagou.

drop function if exists public.quem_paga_entrega(uuid[], date, date);

create or replace function public.quem_paga_entrega(
  p_unit_ids uuid[],
  p_inicio date,
  p_fim date
)
returns table (
  plataforma text,
  pedidos bigint,
  loja_bancou bigint,
  cliente_pagou bigint,
  sem_info bigint,
  valor_bancado_pela_loja numeric,
  valor_pago_pelo_cliente numeric,
  custo_total_entrega numeric
)
language sql
security definer
set search_path to 'public'
as $$
  with ifood_ped as (
    select f.unit_id, f.pedido_associado_ifood as ped,
           sum(abs(f.valor)) filter (where f.descricao_lancamento = 'Taxa entrega iFood') as custo,
           sum(abs(f.valor)) filter (where f.descricao_lancamento = 'Promoção custeada pela loja no delivery') as bancou
      from ifood_financeiro_lancamentos f
     where f.unit_id = any(p_unit_ids)
       and f.data_fato_gerador >= p_inicio
       and f.data_fato_gerador < (p_fim + 1)
       and f.pedido_associado_ifood is not null
     group by 1, 2
  )
  select 'ifood'::text,
         count(*) filter (where custo > 0),
         count(*) filter (where coalesce(bancou, 0) > 0),
         count(*) filter (where custo > 0 and coalesce(bancou, 0) = 0),
         0::bigint,
         coalesce(sum(bancou), 0),
         greatest(coalesce(sum(custo), 0) - coalesce(sum(bancou), 0), 0),
         coalesce(sum(custo), 0)
    from ifood_ped

  union all

  select '99food',
         count(*),
         count(*) filter (where coalesce(p.custo_loja_oferta_entrega_gratis, 0) > 0),
         count(*) filter (where coalesce(p.taxa_entrega_original, 0) > 0
                            and coalesce(p.custo_loja_oferta_entrega_gratis, 0) = 0),
         count(*) filter (where coalesce(p.taxa_entrega_original, 0) = 0
                            and coalesce(p.custo_loja_oferta_entrega_gratis, 0) = 0),
         coalesce(sum(p.custo_loja_oferta_entrega_gratis), 0),
         coalesce(sum(p.taxa_entrega_original), 0),
         coalesce(sum(p.custo_loja_oferta_entrega_gratis), 0) + coalesce(sum(p.custos_logisticos), 0)
    from ninefood_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim

  union all

  select 'keeta',
         count(*), 0::bigint,
         count(*) filter (where coalesce(p.taxa_entrega, 0) > 0),
         count(*) filter (where coalesce(p.taxa_entrega, 0) = 0),
         0::numeric,
         coalesce(sum(p.taxa_entrega), 0),
         0::numeric
    from keeta_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim;
$$;

comment on function public.quem_paga_entrega(uuid[], date, date) is
  'Quem bancou a entrega por pedido. iFood vem do extrato (lançamento "Promoção custeada pela loja no delivery"), não da taxa cobrada do cliente — cobrar do cliente não significa que a loja não pagou.';

revoke all on function public.quem_paga_entrega(uuid[], date, date) from public, anon, authenticated;
