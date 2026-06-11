--------------------------------------------------------------------
-- 0057_ninefood_webhook_events.sql
--
-- Guarda os eventos crus recebidos pelo webhook do 99Food
-- (POST /api/webhooks/99food). Serve pra:
--   - não perder evento (grava cru antes de processar)
--   - deduplicar por event_id (a plataforma pode reenviar o mesmo evento)
--   - auditoria
--
-- Só o service_role (via a rota) escreve. RLS ligado sem policy pública.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

create table if not exists public.ninefood_webhook_events (
  id          uuid primary key default gen_random_uuid(),
  event_id    text,        -- id do evento (pra dedupe), se vier no payload
  event_type  text,        -- tipo do evento, se vier
  store_id    text,        -- loja/merchant, se vier
  order_id    text,        -- pedido, se vier
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  processed   boolean not null default false
);

-- Dedupe: ignora reenvio do mesmo event_id (quando vier preenchido)
create unique index if not exists ninefood_webhook_events_eventid_uniq
  on public.ninefood_webhook_events (event_id)
  where event_id is not null;

create index if not exists ninefood_webhook_events_received_idx
  on public.ninefood_webhook_events (received_at desc);

create index if not exists ninefood_webhook_events_unprocessed_idx
  on public.ninefood_webhook_events (processed, received_at)
  where processed = false;

alter table public.ninefood_webhook_events enable row level security;
