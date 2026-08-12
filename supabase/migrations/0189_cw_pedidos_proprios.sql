-- UM lugar no SQL definindo "o que é pedido do canal próprio".
--
-- O Cardápio Web funciona como HUB: um pedido feito no iFood chega aqui com
-- `sales_channel = 'ifood'`. Esse pedido já é contado pela integração do
-- próprio iFood — somá-lo de novo pelo CW infla o faturamento com dinheiro que
-- não existe, e quando o extrato do iFood entra ele passa a ser contado DUAS
-- vezes. E instalação de sandbox nunca pode aparecer em tela de cliente.
--
-- O TypeScript resolve isso desde sempre (`CANAIS_PROPRIOS` +
-- `installIdsDeProducao` em cardapioweb-imported.ts). O SQL não: cada RPC nova
-- reescrevia a consulta crua e ESQUECIA o filtro. Estavam erradas quatro:
-- vendas_dia_semana_por_loja (duas versões), frete_faixas_by_units e
-- cobertura_por_unidade — esta última escrita por mim hoje de manhã, o que
-- mostra bem que o problema não é desatenção, é não ter onde apoiar.
--
-- Medido em produção (jul/26): 36 pedidos de marketplace, R$ 967,45, apareciam
-- como "Cardápio Web" no relatório de dia da semana e no de frete.
--
-- ⚠️ A lista de canais espelha `CANAIS_PROPRIOS` em
-- src/lib/data/cardapioweb-imported.ts. Ao adicionar canal lá, adicione aqui —
-- a pergunta é uma só: tem intermediário levando comissão? Se não tem, é
-- próprio. Lista de PERMISSÃO e não exclusão: marketplace novo fica de fora
-- por padrão em vez de entrar calado no faturamento.

create or replace view public.cardapioweb_pedidos_proprios
with (security_invoker = true) as
  select p.*
  from public.cardapioweb_pedidos p
  join public.cardapioweb_installs i on i.id = p.install_id
  where i.ambiente = 'producao'
    and p.sales_channel in (
      'catalog',
      'store_front_catalog',
      'portal',
      'whatsapp_extension',
      'totem'
    );

comment on view public.cardapioweb_pedidos_proprios is
  'Pedidos do CANAL PRÓPRIO em instalação de produção. Toda consulta de '
  'faturamento/relatório deve ler daqui, nunca de cardapioweb_pedidos direto: '
  'a tabela crua inclui pedido de marketplace que passou pelo hub (contado em '
  'dobro) e instalação de sandbox.';

revoke all on public.cardapioweb_pedidos_proprios from anon, authenticated;
