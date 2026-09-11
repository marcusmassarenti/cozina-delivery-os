-- ─────────────────────────────────────────────────────────────────────────
-- 0257 — Terceiro ciclo de cobrança (ANUAL EM 12x) + contrato gerado ao assinar
--
-- ANUAL EM 12x: os 12 meses passam inteiros no cartão, em 12 parcelas
-- (parcelamento do Asaas — NÃO é assinatura: a assinatura do Asaas não aceita
-- parcelas). Custa a base + um acréscimo que o Marcus edita em Clientes →
-- Preços dos planos (10% no lançamento, 11/09/26).
--
-- Tudo aqui é ADITIVO: coluna nova com default, CHECK ampliado e tabela nova.
-- Nenhum cliente existente muda de comportamento.
-- ─────────────────────────────────────────────────────────────────────────

-- Acréscimo do anual em 12x sobre a base (que é o preço do anual à vista).
alter table public.platform_settings
  add column if not exists acrescimo_12x_pct numeric not null default 10;
alter table public.platform_settings
  drop constraint if exists platform_settings_acrescimo_12x_pct_check;
alter table public.platform_settings
  add constraint platform_settings_acrescimo_12x_pct_check
  check (acrescimo_12x_pct >= 0 and acrescimo_12x_pct <= 100);

-- O terceiro ciclo.
alter table public.holdings drop constraint if exists holdings_billing_cycle_check;
alter table public.holdings
  add constraint holdings_billing_cycle_check
  check (billing_cycle = any (array['mensal'::text, 'anual'::text, 'anual_12x'::text]));

-- Estado do parcelamento na holding.
--   asaas_installment_id           → parcelamento do período VIGENTE (ou o 1º, pendente)
--   parcelado_ate                  → fim do período pago; é a data de renovação
--   asaas_installment_renovacao_id → parcelamento do período SEGUINTE, emitido
--                                    15 dias antes do fim; vira o vigente quando pago
--   parcelado_nao_renovar          → o cliente cancelou: termina em parcelado_ate
alter table public.holdings
  add column if not exists asaas_installment_id text,
  add column if not exists parcelado_ate date,
  add column if not exists asaas_installment_renovacao_id text,
  add column if not exists parcelado_nao_renovar boolean not null default false;

-- ─── Termo de Adesão (o contrato gerado ao assinar) ─────────────────────
-- Uma linha por adesão. `dados` é o QUADRO-RESUMO congelado no aceite (cliente,
-- plano, lojas, ciclo, valores) e `hash` é o SHA-256 do que foi exibido — o
-- mesmo princípio do aceite da proposta (migration 0211).
create table if not exists public.contratos_assinatura (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  holding_id uuid not null references public.holdings(id) on delete cascade,
  -- Link público do documento (24 bytes aleatórios). É o que vai no e-mail.
  token text not null unique,
  -- aceito   → o cliente marcou o aceite no checkout; pagamento ainda não caiu
  -- vigente  → o 1º pagamento confirmou; o e-mail com o termo sai aqui
  -- cancelado → a cobrança não chegou a ser criada, ou foi abandonada
  status text not null default 'aceito'
    check (status in ('aceito', 'vigente', 'cancelado')),
  dados jsonb not null,
  versao_contrato text not null,
  hash text not null,
  aceite_user_id uuid,
  aceite_nome text,
  aceite_email text,
  aceite_ip text,
  aceite_user_agent text,
  aceito_em timestamptz not null default now(),
  -- Assinatura ou parcelamento do Asaas que este termo originou.
  asaas_ref text,
  vigente_em timestamptz,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contratos_assinatura_holding_idx
  on public.contratos_assinatura (holding_id, aceito_em desc);

-- Sem policy nenhuma: só o servidor (service role) lê e escreve. O link
-- público resolve pelo token no servidor; a tela do cliente, pela holding.
alter table public.contratos_assinatura enable row level security;
revoke all on public.contratos_assinatura from anon, authenticated;
