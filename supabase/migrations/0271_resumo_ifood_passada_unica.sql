-- Resumo do iFood: UMA leitura das linhas do mês em vez de quatro
-- (Marcus, 25/09/26: "focar na fluidez do sistema").
--
-- Era o maior gargalo que sobrava no Dashboard: o mês corrente nunca fica em
-- cache, e esta função levava 0,7–0,8 s (CnP, 14 lojas) e 1,5–1,6 s (DG, 80
-- lojas) com o banco quente — 1,9 s no CnP com o banco frio, porque uma das
-- quatro passagens (a da cesta das vendas) percorria o índice parcial de
-- 'Venda' em ordem de data e relia a mesma página do disco várias vezes
-- (2.962 leituras de disco pra 2.769 páginas). E o count(distinct) ordenava
-- 54 mil linhas em disco (work_mem de 3,5 MB).
--
-- A MESMA matemática da 0254, reorganizada:
--  • `base` lê as linhas do mês/lojas/recorte uma vez só (bitmap scan) e fica
--    materializada;
--  • `por_pedido` agrupa por (loja, pedido) numa passada: se o pedido foi
--    cancelado total/parcial, a cesta da venda (max), e as taxas de entrega e
--    serviço da venda — daí saem o bruto (pedidos NÃO cancelados), o desconto
--    das taxas dos cancelados e as três contagens distintas, sem sort;
--  • `somas` faz todos os filtros por loja numa segunda passada.
--
-- Conferido contra a 0254 com TODAS as lojas do sistema, jan–set/26 e
-- dez/25, mês cheio e dois recortes de dias: 0 linhas diferentes em qualquer
-- coluna. Tempo (quente): CnP 0,73 → 0,29 s; DG 1,5 → 0,71 s; rede inteira
-- 2,9 → 1,3 s (a landing chama com todas — longe dos 8 s do statement_timeout
-- que derrubou a 0248).
--
-- work_mem 16 MB só nesta função: com o padrão (3,5 MB) a base materializada
-- e os agrupamentos iam pro disco. 16 MB deu o mesmo tempo que 64 MB e não
-- aperta a instância (1 GB) com várias chamadas simultâneas — a Evolução
-- dispara 5 de uma vez.
create or replace function public.ifood_financeiro_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start_date date default null,
  p_end_date date default null
)
returns table(
  unit_id uuid, pedidos_unicos integer, bruto numeric, comissao_ifood numeric,
  taxa_entrega numeric, taxa_transacao numeric, taxa_servico_cliente numeric,
  promocao_loja numeric, promocao_ifood numeric, pacote_anuncios numeric,
  ressarcimentos numeric, cancelamento_total_qtd integer, cancelamento_parcial_qtd integer,
  perda_cancelamento numeric, liquido numeric, recebido_direto numeric,
  mensalidade numeric, promocao_loja_estorno numeric, antecipacao numeric
)
language sql
stable
security definer
set search_path to 'public'
set work_mem to '16MB'
as $function$
  with base as materialized (
    select l.unit_id, l.pedido_associado_ifood as ped, l.fato_gerador as fg,
           l.descricao_lancamento as dl, l.valor, l.valor_cesta_final as cesta,
           l.impacto_no_repasse as imp
    from public.ifood_financeiro_lancamentos l
    where l.unit_id = any(p_unit_ids) and l.ref_year = p_year and l.ref_month = p_month
      and (p_start_date is null or l.data_fato_gerador::date >= p_start_date)
      and (p_end_date is null or l.data_fato_gerador::date <= p_end_date)
  ),
  por_pedido as (
    select b.unit_id,
      bool_or(b.fg in ('Venda','Cancelamento Total','Cancelamento Parcial')) as conta,
      bool_or(b.fg = 'Cancelamento Total') as ct,
      bool_or(b.fg = 'Cancelamento Parcial') as cp,
      max(b.cesta) filter (where b.fg = 'Venda') as cesta,
      sum(b.valor) filter (where b.fg = 'Venda' and b.dl = 'Taxa entrega iFood') as entrega,
      sum(b.valor) filter (where b.fg = 'Venda' and b.dl = 'Taxa de serviço iFood cobrada do cliente') as servico
    from base b where b.ped is not null
    group by b.unit_id, b.ped
  ),
  por_loja_pedido as (
    select pp.unit_id,
      count(*) filter (where pp.conta)::integer as pedidos,
      count(*) filter (where pp.ct)::integer as ctq,
      count(*) filter (where pp.cp)::integer as cpq,
      -- Bruto = cesta das vendas cujo pedido NÃO teve cancelamento total.
      coalesce(round(sum(pp.cesta) filter (where not pp.ct)::numeric, 2), 0) as bruto,
      -- Taxas de entrega/serviço da venda de pedido cancelado saem das taxas.
      coalesce(round(sum(pp.entrega) filter (where pp.ct)::numeric, 2), 0) as entrega_cancel,
      coalesce(round(sum(pp.servico) filter (where pp.ct)::numeric, 2), 0) as servico_cancel
    from por_pedido pp group by pp.unit_id
  ),
  somas as (
    select l.unit_id,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda'
        and (l.dl like 'Comissão do iFood%' or l.dl like 'Comissão iFood%'))::numeric, 2), 0) as comissao,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda' and l.dl = 'Taxa entrega iFood')::numeric, 2), 0) as entrega,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda'
        and l.dl in ('Taxa de transação','Taxa de transação iFood beneficios'))::numeric, 2), 0) as transacao,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda'
        and l.dl = 'Taxa de serviço iFood cobrada do cliente')::numeric, 2), 0) as servico,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda'
        and l.dl in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0) as promo_loja,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Venda'
        and l.dl = 'Promoção custeada pelo iFood')::numeric, 2), 0) as promo_ifood,
      coalesce(round(sum(l.valor) filter (where l.dl = 'Pacote de anúncios')::numeric, 2), 0) as anuncios,
      coalesce(round(sum(l.valor) filter (where l.dl = 'Ressarcimento de pedido cancelado')::numeric, 2), 0) as ressarc,
      coalesce(round(sum(l.valor) filter (where l.fg = 'Cancelamento Total'
        and l.imp = true)::numeric, 2), 0) as perda,
      coalesce(round(sum(l.valor) filter (where l.imp = true)::numeric, 2), 0) as liquido,
      coalesce(round(sum(l.valor) filter (where l.dl = 'Entrada Financeira'
        and l.imp = false)::numeric, 2), 0) as direto,
      coalesce(round(sum(l.valor) filter (where l.dl = 'Mensalidade')::numeric, 2), 0) as mensalidade,
      coalesce(round(sum(l.valor) filter (where l.fg <> 'Venda'
        and l.dl in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0) as promo_estorno,
      coalesce(round(sum(l.valor) filter (where l.imp = true
        and (l.fg ilike '%anticipation%' or l.dl ilike '%ANTICIPATION%'))::numeric, 2), 0) as antecipacao
    from base l
    group by l.unit_id
  )
  select s.unit_id,
    coalesce(p.pedidos, 0),
    coalesce(p.bruto, 0),
    s.comissao,
    s.entrega - coalesce(p.entrega_cancel, 0),
    s.transacao,
    s.servico - coalesce(p.servico_cancel, 0),
    s.promo_loja,
    s.promo_ifood,
    s.anuncios,
    s.ressarc,
    coalesce(p.ctq, 0),
    coalesce(p.cpq, 0),
    s.perda,
    s.liquido,
    s.direto,
    s.mensalidade,
    s.promo_estorno,
    s.antecipacao
  from somas s
  left join por_loja_pedido p on p.unit_id = s.unit_id;
$function$;

-- Mesmas permissões de sempre (create or replace preserva, mas fica explícito).
-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date)
  from public, anon, authenticated;
grant execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date)
  to service_role;
