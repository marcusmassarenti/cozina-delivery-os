--------------------------------------------------------------------
-- 0003_profiles.sql
-- Cria tabela profiles com nome + perfil (departamento).
-- Trigger garante que toda vez que um auth.users for criado,
-- uma row em profiles é criada automaticamente.
--------------------------------------------------------------------

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  perfil      text not null default 'viewer',
  -- Perfis sugeridos: administrador, producao, eventos, financeiro,
  -- logistica, comercial, viewer (default). Pode ser livre por enquanto.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada usuário vê apenas o próprio profile.
-- (Quando tivermos role de admin, adicionamos policy pra admin ver todos.)
create policy "profiles_select_own"
  on public.profiles for select
  using (user_id = auth.uid());

-- Usuário atualiza próprio nome (mas não o perfil).
create policy "profiles_update_own_name"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

--------------------------------------------------------------------
-- Trigger: criar profile quando um user for criado em auth.users
--------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
