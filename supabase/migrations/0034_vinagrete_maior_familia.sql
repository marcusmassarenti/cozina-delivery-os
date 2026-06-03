--------------------------------------------------------------------
-- 0034_vinagrete_maior_familia.sql
-- Refino do Vinagrete (JK): porções "MAIOR QUANTIDADE" e "FAMÍLIA" não
-- levam pote → saem do Vinagrete pra "Não considerar".
--   MAIOR: 405,400,412,407,409,402,403   FAMÍLIA: 7711
-- Vinagrete passa de 743 → 678 potes.
--------------------------------------------------------------------

update public.unit_produto_precos
set categoria = 'Não considerar', considerar = false, preco = 0,
    updated_at = now()
where unit_id = (select id from public.units where upper(trim(name)) = 'JK' limit 1)
  and codigo in ('405', '400', '412', '407', '409', '402', '403', '7711');
