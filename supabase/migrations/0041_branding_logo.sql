--------------------------------------------------------------------
-- White-label — logo por empresa (holding)
--
-- Cada cliente pode subir o próprio logo, que substitui o da Cozina no menu.
-- Guarda a URL pública em holdings.logo_url; o arquivo vai pro bucket
-- 'branding' do Supabase Storage (público — logo não é sensível).
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

-- 1) Coluna da URL do logo (idempotente)
alter table public.holdings
  add column if not exists logo_url text;

-- 2) Bucket público pros logos (a validação de tipo/tamanho é feita na action)
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;
