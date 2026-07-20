--------------------------------------------------------------------
-- 0099_last_seen_at.sql
-- "Último acesso" de verdade. Até aqui a plataforma mostrava
-- auth.users.last_sign_in_at, que só muda quando a pessoa digita a senha
-- de novo — quem fica logado (sessão renova sozinha) aparecia sumido há
-- semanas mesmo usando todo dia. Agora gravamos last_seen_at a cada acesso
-- autenticado, com throttle de 5 min pra não escrever a cada request.
--------------------------------------------------------------------

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Última atividade autenticada (touch throttled). Fonte confiável do "último acesso", diferente de auth.users.last_sign_in_at.';

-- Touch throttled: só escreve se nunca viu ou se já passou > 5 min.
-- SECURITY DEFINER pra funcionar sob RLS; o usuário só toca a si mesmo.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.profiles
     set last_seen_at = now()
   where user_id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$function$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;
