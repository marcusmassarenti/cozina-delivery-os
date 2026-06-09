--------------------------------------------------------------------
-- 0053_caixa_logos_bucket.sql
--
-- Bucket público pra logos de contas/cartões (upload do usuário).
-- Upload é feito via service_role (bypassa RLS); leitura é pública.
--------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fin-logos',
  'fin-logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
