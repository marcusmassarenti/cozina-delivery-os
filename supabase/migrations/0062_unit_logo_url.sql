-- Logo por loja (white-label por unidade).
-- Opcional: quando null, o avatar cai no logo da empresa (holdings.logo_url)
-- e, na falta dele, na inicial do nome da loja.
alter table public.units
  add column if not exists logo_url text;
