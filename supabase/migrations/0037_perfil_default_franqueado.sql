-- MÉDIA #17: o default de profiles.perfil era 'viewer', que NÃO existe em
-- app_roles. Um usuário criado pelo Supabase Dashboard (trigger handle_new_user
-- insere só user_id + full_name) ficava 'viewer' → badge/aba erradas e papel
-- ambíguo. Troca o default pra 'franqueado' (escopo de loja, fail-safe) e faz
-- backfill dos 'viewer' existentes.
--
-- O código (listUsers) já normaliza 'viewer' → 'franqueado' na exibição; esta
-- migration limpa a fonte pra novos profiles nascerem certos.

alter table public.profiles
  alter column perfil set default 'franqueado';

update public.profiles
  set perfil = 'franqueado'
  where perfil is null or perfil = 'viewer';
