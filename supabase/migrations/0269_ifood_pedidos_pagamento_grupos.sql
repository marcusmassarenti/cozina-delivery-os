/*
 * Painel de pagamentos do iFood somado NO BANCO (Marcus, 25/09/26: "focar
 * na fluidez do sistema").
 *
 * `getNetworkPagamentoResumo` (tela Pedidos e DRE) baixava TODOS os pedidos
 * do mês com 15 colunas pra somar em JS — 2,2 s no CnP. Aqui o banco devolve
 * os pedidos já agrupados pelas chaves que o painel usa (forma, turno,
 * entrega, bandeira de VR, situação), com as somas; o JS só junta os grupos.
 * As regras são as do `aggregate()` em lib/data/ifood-pedidos.ts:
 *  - vazio vira "Outros" (forma) ou "—" (turno/entrega);
 *  - taxa de serviço e comissões entram em MÓDULO;
 *  - situação: contém CONCLU → concluído; senão contém CANCEL → cancelado.
 *
 * Só service_role executa.
 */
create or replace function public.ifood_pedidos_pagamento_grupos(
  p_unit_ids uuid[] default null,
  p_year int default null,
  p_month int default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  forma_grupo text,
  turno text,
  produto_logistico text,
  bandeira_vr text,
  situacao text,
  pedidos bigint,
  total_pago numeric,
  valor_itens numeric,
  incentivo_ifood numeric,
  incentivo_loja numeric,
  incentivo_rede numeric,
  taxa_servico numeric,
  taxas_comissoes numeric,
  taxa_entrega_cliente numeric,
  valor_liquido numeric
)
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(p.forma_grupo, ''), 'Outros'),
         coalesce(nullif(p.turno, ''), '—'),
         coalesce(nullif(p.produto_logistico, ''), '—'),
         nullif(p.bandeira_vr, ''),
         case when upper(coalesce(p.status_final, '')) like '%CONCLU%' then 'concluido'
              when upper(coalesce(p.status_final, '')) like '%CANCEL%' then 'cancelado'
              else 'outro' end,
         count(*),
         sum(coalesce(p.total_pago_cliente, 0)),
         sum(coalesce(p.valor_itens, 0)),
         sum(coalesce(p.incentivo_ifood, 0)),
         sum(coalesce(p.incentivo_loja, 0)),
         sum(coalesce(p.incentivo_rede, 0)),
         sum(abs(coalesce(p.taxa_servico, 0))),
         sum(abs(coalesce(p.taxas_comissoes, 0))),
         sum(coalesce(p.taxa_entrega_cliente, 0)),
         sum(coalesce(p.valor_liquido, 0))
  from public.ifood_pedidos p
  where (p_unit_ids is null or p.unit_id = any (p_unit_ids))
    and (
      (p_de is not null and p.data between p_de and p_ate)
      or (p_de is null and p.ref_year = p_year and p.ref_month = p_month)
    )
  group by 1, 2, 3, 4, 5;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ifood_pedidos_pagamento_grupos(uuid[], int, int, date, date)
  from public, anon, authenticated;
grant execute on function public.ifood_pedidos_pagamento_grupos(uuid[], int, int, date, date)
  to service_role;
