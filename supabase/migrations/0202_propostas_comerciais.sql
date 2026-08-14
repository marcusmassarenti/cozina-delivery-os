-- Propostas comerciais geradas dentro do sistema.
--
-- POR QUE EXISTE: a proposta é o documento que o cliente ASSINA, e todo dado
-- dela já vive no cadastro (razão social, CNPJ, endereço, plano, lojas ativas,
-- valor). Montar isso à mão em editor de texto é o mesmo erro do Ctrl-C/Ctrl-V
-- que o cliente Prime tinha com o relatório dele: trabalho manual sobre dado
-- que o sistema já sabe.
--
-- ⚠️ `dados` É UM RETRATO, NÃO UM ESPELHO. A proposta guarda os valores como
-- estavam no dia da assinatura. Se o cadastro mudar depois — o cliente troca de
-- plano, abre lojas, muda de endereço — o documento assinado NÃO pode mudar
-- junto. Documento assinado que se reescreve sozinho não vale nada.
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),

  -- Número legível, sequencial por ano: "2026-0001".
  numero text not null unique,
  holding_id uuid not null references public.holdings(id) on delete restrict,

  -- rascunho → enviada → assinada | recusada | cancelada
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','assinada','recusada','cancelada')),

  -- Retrato completo do documento (ver aviso acima).
  dados jsonb not null default '{}'::jsonb,

  -- Assinatura eletrônica (ZapSign/Autentique/Clicksign). Guardamos o id do
  -- documento no provedor pra reconciliar o webhook de "assinado".
  assinatura_provider text,
  assinatura_doc_id text,
  assinatura_url text,
  enviada_em timestamptz,
  assinada_em timestamptz,
  signatario_nome text,
  signatario_email text,

  criada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists propostas_holding_idx on public.propostas (holding_id);
create index if not exists propostas_status_idx on public.propostas (status);
-- O webhook do provedor chega com o id DELE, não com o nosso.
create index if not exists propostas_doc_idx on public.propostas (assinatura_doc_id)
  where assinatura_doc_id is not null;

-- RLS LIGADA E SEM POLÍTICA: só o service_role enxerga.
--
-- Proposta comercial tem preço negociado, desconto e dado cadastral de outro
-- cliente — é exatamente o tipo de tabela que não pode ter política frouxa.
-- O acesso passa pelo admin client, sempre depois de `requireSuperadmin()`.
-- (Mesmo padrão de email_enviados e ifood_activation_requests. Ver a
-- reincidência de RPC anônima em jul e ago/26 — aqui não se repete.)
alter table public.propostas enable row level security;

comment on table public.propostas is
  'Propostas comerciais geradas no sistema. `dados` é o retrato do documento no momento da geração — nunca reescrever a partir do cadastro atual. Sem política de RLS: acesso só via service_role, após requireSuperadmin().';
