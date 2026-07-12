-- 0086 · Segurança: idempotência / anti-replay do webhook do Asaas
--
-- O handler aplicava paid=true / suspend_on=null a cada entrega de
-- PAYMENT_CONFIRMED. Sem registro do que já foi processado, um reenvio (o Asaas
-- reenvia bastante) ou um replay de evento antigo reativava conta cancelada e
-- duplicava lançamento no histórico. Guardamos o id do evento e ignoramos
-- repetição.

create table if not exists public.asaas_processed_events (
  event_key    text primary key,
  event        text,
  holding_id   uuid references public.holdings(id) on delete set null,
  processed_at timestamptz not null default now()
);

alter table public.asaas_processed_events enable row level security;
-- Sem policies: só o service_role (webhook no servidor) toca essa tabela.
