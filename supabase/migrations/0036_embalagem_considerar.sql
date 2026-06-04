--------------------------------------------------------------------
-- 0036_embalagem_considerar.sql
-- Embalagem (lacre/grampo/durex/bobina) passa a ter "considerar".
-- Marcus pediu pra NÃO contar → default false (não entra no total).
--------------------------------------------------------------------

alter table public.unit_embalagem
  add column if not exists considerar boolean not null default false;
