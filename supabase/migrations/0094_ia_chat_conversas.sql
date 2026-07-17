-- Consultor IA — histórico de conversas (como a lateral do Claude).
--
-- Conversas são POR USUÁRIO (cada pessoa tem o próprio histórico, igual o
-- Claude), dentro da holding. Um título curto derivado da primeira pergunta
-- deixa a lista legível. Some com o usuário / a holding (cascade).

create table if not exists public.ia_chat_conversas (
  id uuid primary key default uuid_generate_v4(),
  holding_id uuid not null references public.holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ia_chat_mensagens (
  id uuid primary key default uuid_generate_v4(),
  conversa_id uuid not null references public.ia_chat_conversas(id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo text not null,
  created_at timestamptz not null default now()
);

-- Lista de conversas do usuário (mais recentes primeiro).
create index if not exists ia_chat_conversas_user_idx
  on public.ia_chat_conversas (user_id, updated_at desc);
-- Mensagens de uma conversa, em ordem.
create index if not exists ia_chat_mensagens_conversa_idx
  on public.ia_chat_mensagens (conversa_id, created_at);

alter table public.ia_chat_conversas enable row level security;
alter table public.ia_chat_mensagens enable row level security;
-- Sem policy: só o service_role (app) toca; o escopo por user_id/holding é
-- aplicado na camada do app (server actions), como no resto do sistema.
