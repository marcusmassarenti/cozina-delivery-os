--------------------------------------------------------------------
-- 0117_unit_platforms_cardapioweb.sql
-- Permite marcar que a unidade vende pelo Cardápio Web.
--
-- POR QUE SÓ AQUI: 'cardapioweb' entra apenas no CHECK de unit_platforms,
-- que responde "por onde essa loja vende?". As outras tabelas com o mesmo
-- CHECK (daily_entries, monthly_platform_entries, platform_imports,
-- producao_ficha_tecnica) guardam LANÇAMENTO DE MARKETPLACE — taxa de
-- comissão, VR, repasse, cancelamento. Canal próprio não tem nada disso:
-- o dinheiro cai direto na loja. Misturar os dois faria a DRE somar uma
-- comissão que não existe.
--
-- Aditiva: só amplia o conjunto aceito, nenhuma linha existente muda.
--------------------------------------------------------------------

alter table public.unit_platforms
  drop constraint if exists unit_platforms_platform_check;

alter table public.unit_platforms
  add constraint unit_platforms_platform_check
  check (platform in ('ifood', '99food', 'keeta', 'cardapioweb'));

comment on column public.unit_platforms.platform is
  'Canal de venda da loja. ifood/99food/keeta sao marketplaces (entram na '
  'DRE com comissao e repasse); cardapioweb e canal proprio (venda direta, '
  'sem comissao de marketplace).';
