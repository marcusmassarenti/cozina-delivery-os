-- Comunicação da ativação iFood nos dois sentidos:
-- o cliente pode avisar que já aprovou no Portal do Parceiro (pra o admin
-- saber a hora de vincular), e a coluna serve de sinal no painel do admin.
alter table public.ifood_activation_requests
  add column if not exists cliente_confirmou_at timestamptz;

comment on column public.ifood_activation_requests.cliente_confirmou_at is
  'Quando o CLIENTE apertou "Já aprovei no iFood" — sinaliza pro admin vincular. NULL = ainda não confirmou.';
