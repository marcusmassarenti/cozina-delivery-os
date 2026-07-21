--------------------------------------------------------------------
-- 0100_fin_categories_dre_group.sql
-- Eixo de DRE gerencial nas categorias do Caixa. Antes a categoria só tinha
-- despesa/receita — sem isso não dava pra montar DRE, margem de contribuição
-- nem ponto de equilíbrio. Agora cada categoria tem um GRUPO de DRE e a
-- NATUREZA (fixo/variável), que é o que separa custo fixo de variável.
--------------------------------------------------------------------

alter table public.fin_categories
  add column if not exists dre_group text check (dre_group in ('receita','deducao','cmv','cmo','fixa','variavel','investimento')),
  add column if not exists natureza text check (natureza in ('fixo','variavel'));

comment on column public.fin_categories.dre_group is 'Grupo no DRE gerencial: receita/deducao/cmv/cmo/fixa/variavel/investimento';
comment on column public.fin_categories.natureza is 'Comportamento do custo: fixo ou variavel (pra margem de contribuição e ponto de equilíbrio)';

-- Backfill por heurística de nome (não sobrescreve o que já estiver classificado)
update public.fin_categories set dre_group='receita', natureza='variavel'
  where dre_group is null and kind='receita';
update public.fin_categories set dre_group='deducao', natureza='variavel'
  where dre_group is null and (name ilike '%taxa%delivery%' or name ilike '%imposto%' or name ilike '%cart_o%' or name ilike '%comiss%' or name ilike '%maquin%');
update public.fin_categories set dre_group='cmv', natureza='variavel'
  where dre_group is null and (name ilike '%fornecedor%' or name ilike '%carne%' or name ilike '%bebida%' or name ilike '%embalagem%' or name ilike '%hortifruti%' or name ilike '%mercearia%' or name ilike '%insumo%' or name ilike '%g_s%' or name ilike '%descart%');
update public.fin_categories set dre_group='cmo', natureza='fixo'
  where dre_group is null and (name ilike '%folha%' or name ilike '%sal_rio%' or name ilike '%m_o de obra%' or name ilike '%pr_-labore%' or name ilike '%prolabore%' or name ilike '%encargo%');
update public.fin_categories set dre_group='fixa', natureza='fixo'
  where dre_group is null and (name ilike '%aluguel%' or name ilike '%energia%' or name ilike '%_gua%' or name ilike '%internet%' or name ilike '%telefone%' or name ilike '%manuten%' or name ilike '%marketing%' or name ilike '%software%' or name ilike '%sistema%' or name ilike '%contador%' or name ilike '%condom%' or name ilike '%seguro%');
update public.fin_categories set dre_group='variavel', natureza='variavel'
  where dre_group is null and kind='despesa';
