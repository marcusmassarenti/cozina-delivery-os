-- Chat de suporte dentro do Delivery OS.
--
-- POR QUE: hoje o chamado chega por WhatsApp — fora do sistema, sem contexto e
-- sem histórico. O cliente escreve "minha loja não conectou" e começa uma
-- investigação do zero: qual loja, desde quando, o que já foi tentado.
--
-- Dentro do sistema a resposta já existe no banco no instante da pergunta. O
-- chat lê o estado real da conta (ver `suporte-raio-x.ts`) e responde com fato
-- e data. O que ele não puder afirmar, sobe pra um humano — com o diagnóstico
-- já anexado.
--
-- `status` é o ciclo do chamado, não um rótulo:
--   ia                = a IA está atendendo
--   aguardando_humano = cliente pediu gente e ninguém pegou  ← a fila real
--   com_humano        = alguém da equipe assumiu
--   resolvida         = encerrada

create table if not exists public.suporte_conversas (
  id              uuid primary key default gen_random_uuid(),
  holding_id      uuid not null references public.holdings(id) on delete cascade,
  aberta_por      uuid not null,
  assunto         text,
  status          text not null default 'ia'
                  check (status in ('ia','aguardando_humano','com_humano','resolvida')),
  atendente_id    uuid,
  criada_em       timestamptz not null default now(),
  ultima_msg_em   timestamptz not null default now(),
  resolvida_em    timestamptz,
  lida_cliente_em timestamptz,
  lida_equipe_em  timestamptz
);

create table if not exists public.suporte_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.suporte_conversas(id) on delete cascade,
  autor       text not null check (autor in ('cliente','ia','equipe')),
  user_id     uuid,
  texto       text not null,
  /* Retrato do estado da conta no momento da resposta da IA. Guardado para
     saber DEPOIS com base em quê ela respondeu — sem isso, uma resposta errada
     vira discussão sem prova. */
  raio_x      jsonb,
  criada_em   timestamptz not null default now()
);

create index if not exists suporte_conversas_fila_idx
  on public.suporte_conversas (status, ultima_msg_em desc);
create index if not exists suporte_conversas_holding_idx
  on public.suporte_conversas (holding_id, ultima_msg_em desc);
create index if not exists suporte_mensagens_conversa_idx
  on public.suporte_mensagens (conversa_id, criada_em);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;
revoke all on public.suporte_conversas from anon, authenticated;
revoke all on public.suporte_mensagens from anon, authenticated;
