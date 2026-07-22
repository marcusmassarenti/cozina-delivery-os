--------------------------------------------------------------------
-- 0107_ifood_activation_requests.sql
--
-- Fila de solicitações "conecta minha loja no iFood via API".
--
-- Contexto: o app do iFood é CENTRALIZADO, então não existe código de
-- ativação self-service (o /oauth/userCode devolve "Grant type not
-- authorized" — é só pra apps distribuídos). O fluxo real é manual:
-- o desenvolvedor solicita acesso à loja pelo CNPJ no Portal do
-- Desenvolvedor (aba Permissões) e o Proprietário aprova no Portal do
-- Parceiro. Propagação: até 10 min + token novo.
--
-- Esta tabela transforma esse fluxo manual em autoatendimento com fila:
-- o CLIENTE pede pela tela (informando o CNPJ), o Marcus vê a fila,
-- faz a solicitação no portal e vai marcando o status. O cliente
-- acompanha o andamento sem precisar perguntar.
--
--   pendente   → cliente pediu; Marcus ainda não abriu o portal
--   solicitada → Marcus enviou a solicitação; falta o cliente APROVAR
--                no Portal do Parceiro dele
--   ativa      → loja apareceu no GET /merchants e foi vinculada
--   recusada   → não foi possível (CNPJ não achado, loja de outra conta…)
--
-- RLS habilitada SEM policies (service_role only), padrão do projeto.
--------------------------------------------------------------------

create table if not exists public.ifood_activation_requests (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references public.holdings(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete set null,
  cnpj         text not null,
  status       text not null default 'pendente'
                 check (status in ('pendente', 'solicitada', 'ativa', 'recusada')),
  -- Observação do admin (ex.: motivo da recusa) — aparece pro cliente.
  nota         text,
  requested_by uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ifood_activation_requests_holding_idx
  on public.ifood_activation_requests (holding_id, created_at desc);
create index if not exists ifood_activation_requests_status_idx
  on public.ifood_activation_requests (status)
  where status in ('pendente', 'solicitada');

alter table public.ifood_activation_requests enable row level security;

comment on table public.ifood_activation_requests is
  'Fila de ativação de loja iFood via API (app centralizado não tem código self-service). Cliente pede com CNPJ; admin solicita no Portal do Desenvolvedor e atualiza o status.';
