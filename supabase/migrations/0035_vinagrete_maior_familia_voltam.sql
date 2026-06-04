--------------------------------------------------------------------
-- 0035_vinagrete_maior_familia_voltam.sql
-- Revert da 0034: MAIOR QUANTIDADE e FAMÍLIA LEVAM pote, sim.
-- Voltam de "Não considerar" pra "Vinagrete" (R$ 0,92, considerar).
--   MAIOR: 405,400,412,407,409,402,403   FAMÍLIA: 7711
-- Vinagrete volta de 678 → 743 potes.
--------------------------------------------------------------------

update public.unit_produto_precos
set categoria = 'Vinagrete', considerar = true, preco = 0.92,
    updated_at = now()
where unit_id = (select id from public.units where upper(trim(name)) = 'JK' limit 1)
  and codigo in ('405', '400', '412', '407', '409', '402', '403', '7711');
