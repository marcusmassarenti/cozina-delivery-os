--------------------------------------------------------------------
-- 0012_financeiro_rpc.sql
-- Funções SQL agregadas pra Dashboard e página da unidade.
--
-- Antes: client-side fazia SELECT de 110k+ linhas, paginava em 100+
-- chamadas e agregava em JS. Lento.
--
-- Agora: 1 SELECT com SUM/COUNT FILTER + GROUP BY no Postgres,
-- retorna direto os totais. ~100x mais rápido.
--------------------------------------------------------------------

-- ───────────────────────────────────────────────────────────────────
-- Resumo financeiro AGREGADO por unidade (vários unit_ids de uma vez)
-- Usado pelo Dashboard pra somar a rede inteira.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.ifood_financeiro_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (
  unit_id                 uuid,
  pedidos_unicos          integer,
  bruto                   numeric,
  comissao_ifood          numeric,
  taxa_entrega            numeric,
  taxa_transacao          numeric,
  taxa_servico_cliente    numeric,
  promocao_loja           numeric,
  promocao_ifood          numeric,
  pacote_anuncios         numeric,
  ressarcimentos          numeric,
  cancelamento_total_qtd  integer,
  cancelamento_parcial_qtd integer,
  perda_cancelamento      numeric,
  liquido                 numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.unit_id,
    -- Pedidos únicos (qualquer fato_gerador ligado a Venda/Cancelamento)
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador in ('Venda', 'Cancelamento Total', 'Cancelamento Parcial')
        and l.pedido_associado_ifood is not null
    )::integer as pedidos_unicos,

    -- Bruto: Entrada Financeira em Vendas
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Entrada Financeira'
    )::numeric, 2), 0) as bruto,

    -- Comissão iFood (cobrança em vendas)
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Comissão do iFood (entrega iFood)',
          'Comissão do iFood'
        )
    )::numeric, 2), 0) as comissao_ifood,

    -- Taxa entrega iFood
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Taxa entrega iFood'
    )::numeric, 2), 0) as taxa_entrega,

    -- Taxa de transação (cartão + benefícios)
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Taxa de transação',
          'Taxa de transação iFood beneficios'
        )
    )::numeric, 2), 0) as taxa_transacao,

    -- Taxa de serviço repassada do cliente
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente'
    )::numeric, 2), 0) as taxa_servico_cliente,

    -- Promoção custeada pela LOJA
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Promoção custeada pela loja',
          'Promoção custeada pela loja no delivery'
        )
    )::numeric, 2), 0) as promocao_loja,

    -- Promoção custeada pelo iFood (subsídio)
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Promoção custeada pelo iFood'
    )::numeric, 2), 0) as promocao_ifood,

    -- Pacote de anúncios (qualquer fato_gerador)
    coalesce(round(sum(l.valor) filter (
      where l.descricao_lancamento = 'Pacote de anúncios'
    )::numeric, 2), 0) as pacote_anuncios,

    -- Ressarcimentos
    coalesce(round(sum(l.valor) filter (
      where l.descricao_lancamento = 'Ressarcimento de pedido cancelado'
    )::numeric, 2), 0) as ressarcimentos,

    -- Cancelamentos: pedidos únicos
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Total'
        and l.pedido_associado_ifood is not null
    )::integer as cancelamento_total_qtd,

    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Parcial'
        and l.pedido_associado_ifood is not null
    )::integer as cancelamento_parcial_qtd,

    -- Perda em cancelamentos (com impacto no repasse)
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Cancelamento Total'
        and l.impacto_no_repasse = true
    )::numeric, 2), 0) as perda_cancelamento,

    -- Líquido (entra na conta): tudo com impacto_no_repasse=true
    coalesce(round(sum(l.valor) filter (
      where l.impacto_no_repasse = true
    )::numeric, 2), 0) as liquido

  from public.ifood_financeiro_lancamentos l
  where l.unit_id = any(p_unit_ids)
    and l.ref_year = p_year
    and l.ref_month = p_month
  group by l.unit_id;
$$;

comment on function public.ifood_financeiro_resumo_by_units is
  'Agregação financeira por unidade. Substitui o fetch-all-and-aggregate-in-JS. ~100x mais rápido.';

-- Permissões: anon/authenticated podem chamar
grant execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer)
  to anon, authenticated, service_role;
