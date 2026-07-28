--------------------------------------------------------------------
-- 0124_asaas_sub_valor_audit_log.sql
--
-- (a) holdings.asaas_sub_valor — último valor enviado à assinatura
--     recorrente. A mensalidade é por loja, então cada loja nova muda o
--     preço; a assinatura no Asaas ficava congelada no valor da adesão e
--     ninguém percebia, porque a cobrança continua acontecendo — só que
--     no valor errado, todo mês. Guardar o último valor evita bater na
--     API à toa e mostra quando o cobrado descolou do plano.
--
-- (b) platform_audit_log — quem mexeu em plano, cobrança e liberações.
--     Antes nada disso deixava rastro: dava pra trocar plano ou marcar
--     como pago sem autor nem data, e um valor errado virava discussão
--     sem como reconstruir o que aconteceu.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists asaas_sub_valor numeric(12,2);

comment on column public.holdings.asaas_sub_valor is
  'Ultimo valor ENVIADO pra assinatura recorrente do Asaas. Serve pra nao bater '
  'na API quando nada mudou e pra ver quando o valor cobrado descolou do plano.';

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references public.holdings(id) on delete set null,
  actor_id uuid,
  actor_email text,
  acao text not null,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists platform_audit_log_por_cliente
  on public.platform_audit_log (holding_id, criado_em desc);
create index if not exists platform_audit_log_recentes
  on public.platform_audit_log (criado_em desc);

comment on table public.platform_audit_log is
  'Quem mexeu em plano, cobranca e liberacoes de cliente. Antes nada disso '
  'deixava rastro: dava pra trocar plano ou marcar como pago sem registro de '
  'autor nem data, e um valor errado virava discussao sem como reconstruir.';
