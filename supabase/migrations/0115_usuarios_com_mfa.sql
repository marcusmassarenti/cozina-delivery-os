-- Quem tem verificação em duas etapas confirmada.
--
-- POR QUE ISSO EXISTE: o `auth.admin.listUsers()` do Supabase NÃO devolve os
-- fatores de MFA — só o `getUserById()` devolve, um usuário por vez. Sem esta
-- função, a tela de Usuários teria que fazer uma chamada HTTP POR USUÁRIO só
-- pra desenhar o selo de 2FA. Aqui sai numa consulta só.
--
-- Descoberto na prática: a primeira versão da tela derivava o estado do
-- listUsers e vinha SEMPRE falso, o que escondia o botão de resetar o 2FA e
-- deixava a funcionalidade inalcançável.
--
-- SECURITY DEFINER porque `auth.mfa_factors` não é acessível ao papel do
-- cliente. A função é READ-ONLY e devolve apenas IDs de usuário — nenhum
-- segredo do fator (o `secret` do TOTP nunca sai daqui).

create or replace function public.usuarios_com_mfa()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct f.user_id
  from auth.mfa_factors f
  where f.status = 'verified'
$$;

comment on function public.usuarios_com_mfa() is
  'IDs dos usuários com 2FA (TOTP) confirmado. Read-only; não expõe o segredo do fator. Usada pela tela de Usuários pra mostrar o selo e liberar o reset.';

-- Só quem já está autenticado pode chamar. O escopo por empresa é aplicado na
-- aplicação (a tela cruza com os usuários da holding), então esta função
-- sozinha não vaza nada útil: devolve só UUIDs, sem e-mail nem nome.
revoke all on function public.usuarios_com_mfa() from public, anon;
grant execute on function public.usuarios_com_mfa() to authenticated, service_role;
