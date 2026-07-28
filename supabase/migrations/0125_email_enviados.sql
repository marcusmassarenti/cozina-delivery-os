-- Registro de e-mails da régua de ciclo de vida.
--
-- Esta tabela não é log: é o ESTADO da régua. A trava contra e-mail repetido
-- mora no índice único abaixo, não em cálculo de data — assim o cron pode
-- rodar todo dia, rodar duas vezes ou escorregar de horário (no plano Hobby a
-- Vercel tem tolerância de ~59 min) que ninguém recebe a mesma mensagem duas
-- vezes.

create table if not exists public.email_enviados (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references public.holdings(id) on delete cascade,
  tipo text not null,
  destinatario text not null,
  enviado_em timestamptz not null default now(),
  resend_id text,
  -- Preenchido só quando o envio falhou. Envio que deu certo tem erro null —
  -- é isso que o índice único usa pra decidir o que já "conta como enviado".
  erro text
);

-- Só envios BEM-SUCEDIDOS ocupam a vaga. Uma tentativa que falhou (chave
-- ausente, domínio não verificado, caixa cheia) fica gravada pra diagnóstico
-- mas NÃO bloqueia a nova tentativa no dia seguinte.
create unique index if not exists email_enviados_unico
  on public.email_enviados (holding_id, tipo)
  where erro is null;

create index if not exists email_enviados_holding_idx
  on public.email_enviados (holding_id, enviado_em desc);

alter table public.email_enviados enable row level security;

-- Sem policy de propósito: quem escreve aqui é o cron (service_role, que passa
-- por cima da RLS). Nenhum usuário final precisa ler o histórico de envio.
