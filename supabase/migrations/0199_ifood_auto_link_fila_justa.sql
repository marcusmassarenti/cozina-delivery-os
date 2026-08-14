-- Evita starvation no auto-vínculo: cada tentativa vai para o fim da fila.
-- Uma loja sem extrato pode exigir sondagens caras; sem este carimbo ela podia
-- ocupar todas as execuções do cron e impedir que as demais fossem avaliadas.
alter table public.ifood_activation_requests
  add column if not exists last_auto_link_checked_at timestamptz;

comment on column public.ifood_activation_requests.last_auto_link_checked_at is
  'última vez que o auto-vínculo iFood tentou confirmar esta solicitação; ordena a fila de modo justo';

create index if not exists ifood_activation_requests_auto_link_queue_idx
  on public.ifood_activation_requests (last_auto_link_checked_at asc nulls first, created_at asc)
  where status in ('pendente', 'solicitada');
