-- Quantos pedidos o CLIENTE pagou a entrega e quantos a LOJA bancou.
--
-- ⚠️ A cobertura faz parte da resposta. No iFood, pedido que entra pela API
-- não traz a taxa cobrada do cliente, e o endpoint de detalhe do pedido
-- responde 403 (módulo Order não liberado pro nosso app). Metade de julho
-- está sem esse dado. Contar esses pedidos como "entrega grátis" inverteria a
-- conclusão — por isso `pedidos_sem_dado` sai separado e nunca é somado aos
-- outros dois.
--
-- O custo da loja vem do FINANCEIRO ("Taxa entrega iFood"), que tem cobertura
-- total do mês: é o que o iFood de fato debita do repasse.

create or replace function public.quem_paga_entrega(
  p_unit_ids uuid[],
  p_inicio date,
  p_fim date
)
returns table (
  plataforma text,
  pedidos bigint,
  pedidos_com_dado bigint,
  pedidos_sem_dado bigint,
  cliente_pagou bigint,
  loja_bancou bigint,
  valor_cliente numeric,
  custo_loja numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select 'ifood'::text,
         count(*),
         count(*) filter (where p.taxa_entrega_cliente is not null),
         count(*) filter (where p.taxa_entrega_cliente is null),
         count(*) filter (where p.taxa_entrega_cliente > 0),
         count(*) filter (where p.taxa_entrega_cliente = 0),
         coalesce(sum(p.taxa_entrega_cliente), 0),
         coalesce((
           select sum(abs(f.valor)) from ifood_financeiro_lancamentos f
            where f.unit_id = any(p_unit_ids)
              and f.descricao_lancamento = 'Taxa entrega iFood'
              and f.data_fato_gerador >= p_inicio
              and f.data_fato_gerador < (p_fim + 1)
         ), 0)
    from ifood_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim

  union all

  select '99food',
         count(*), count(*), 0,
         count(*) filter (where coalesce(p.taxa_entrega_original, 0) > 0),
         count(*) filter (where coalesce(p.taxa_entrega_original, 0) = 0),
         coalesce(sum(p.taxa_entrega_original), 0),
         coalesce(sum(p.custo_loja_oferta_entrega_gratis), 0)
           + coalesce(sum(p.custos_logisticos), 0)
    from ninefood_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim

  union all

  select 'keeta',
         count(*), count(*), 0,
         count(*) filter (where coalesce(p.taxa_entrega, 0) > 0),
         count(*) filter (where coalesce(p.taxa_entrega, 0) = 0),
         coalesce(sum(p.taxa_entrega), 0),
         0::numeric
    from keeta_pedidos p
   where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim;
$$;

comment on function public.quem_paga_entrega(uuid[], date, date) is
  'Divide os pedidos entre cliente-pagou e loja-bancou. pedidos_sem_dado é obrigatório na leitura: no iFood, metade dos pedidos não traz a taxa do cliente e tratá-los como grátis inverte a conclusão.';

revoke all on function public.quem_paga_entrega(uuid[], date, date) from public, anon, authenticated;
