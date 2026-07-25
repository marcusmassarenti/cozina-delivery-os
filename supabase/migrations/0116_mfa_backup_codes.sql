-- Códigos de recuperação do 2FA.
--
-- POR QUE: o TOTP do Supabase não tem códigos de backup. Quem trocava de
-- celular sem migrar o autenticador dependia de um admin desativar o 2FA — o
-- que transforma perda de aparelho em chamado, e o chamado no elo mais fraco
-- (engenharia social contra o suporte). Com estes códigos, a pessoa se
-- recupera sozinha.
--
-- COMO É USADO: 8 códigos de uso único, mostrados UMA vez no momento em que o
-- 2FA é ativado. Ao usar um deles no login, o 2FA é DESATIVADO e a pessoa
-- cadastra o aparelho novo. É mais seguro do que só "pular" a verificação:
-- deixa o estado explícito, em vez de manter uma conta protegida por um
-- segredo que já circulou em papel.
--
-- ⚠️ Guardamos apenas o HASH. O código em texto existe só naquele instante,
-- na tela. Nem nós conseguimos recuperá-lo depois — igual a uma senha.

create table if not exists public.mfa_backup_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- sha256(user_id || ':' || código normalizado). O user_id entra no hash pra
  -- que o mesmo código em contas diferentes gere hashes diferentes.
  code_hash   text not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  unique (user_id, code_hash)
);

-- A consulta quente é "os códigos ainda válidos deste usuário".
create index if not exists mfa_backup_codes_disponiveis_idx
  on public.mfa_backup_codes (user_id)
  where used_at is null;

alter table public.mfa_backup_codes enable row level security;

-- SEM policies de propósito: com RLS ligada e nenhuma policy, o acesso é
-- negado para anon e authenticated. Só o servidor (service_role, que ignora
-- RLS) lê e escreve aqui. Não há motivo pro navegador tocar nesta tabela —
-- o usuário nunca precisa ler os hashes, só saber quantos códigos sobraram.

comment on table public.mfa_backup_codes is
  'Códigos de recuperação do 2FA (uso único). Só hash; o texto existe apenas na tela, no momento em que é gerado. Acesso exclusivo do servidor.';
