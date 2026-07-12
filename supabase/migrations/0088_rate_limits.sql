-- 0088 · Segurança: rate limiting próprio (via Postgres, sem infra nova)
--
-- O app não tinha rate limit próprio (login/recuperação dependiam só do limite
-- embutido do Supabase Auth). Este limitador é "distribuído" porque o banco é
-- compartilhado entre todas as instâncias serverless. rate_limit_hit conta os
-- acessos por chave numa janela e devolve true (permitido) / false (estourou),
-- de forma atômica (lock de linha no upsert).

create table if not exists public.rate_limits (
  key      text primary key,
  count    int not null default 0,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
-- Sem policies: só o service_role (app no servidor) toca.

create or replace function public.rate_limit_hit(
  p_key text,
  p_max int,
  p_window_secs int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_secs))
  on conflict (key) do update
    set count = case when public.rate_limits.reset_at < now() then 1
                     else public.rate_limits.count + 1 end,
        reset_at = case when public.rate_limits.reset_at < now()
                        then now() + make_interval(secs => p_window_secs)
                        else public.rate_limits.reset_at end
  returning count into v_count;
  return v_count <= p_max;  -- true = dentro do limite
end $$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
