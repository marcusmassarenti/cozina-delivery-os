-- Fecha as duas tabelas que nasceram sem RLS nas 0121 e 0124.
--
-- Sem RLS, tabela em `public` herda o default privilege do Supabase: `anon`
-- (chave pública, vai no bundle) ficava com SELECT/INSERT/UPDATE/DELETE em
-- cima do faturamento dos licenciados e da própria trilha de auditoria.
--
-- Não criamos policy: os 7 pontos de acesso do código usam createAdminClient()
-- (service role, que ignora RLS) em arquivos `server-only` — src/lib/data/faturas.ts
-- e src/lib/data/auditoria.ts. RLS ligada + zero policy = nega anon/authenticated
-- e mantém o painel funcionando. Mesmo padrão de api_clients e rate_limits.

alter table public.holding_invoices enable row level security;
alter table public.platform_audit_log enable row level security;

-- Defesa em profundidade: tira o grant herdado, pra não depender só da RLS.
revoke all on public.holding_invoices from anon, authenticated;
revoke all on public.platform_audit_log from anon, authenticated;

-- A 0125 já liga a RLS de email_enviados, mas prod estava sem: a migration foi
-- aplicada antes daquela linha entrar no arquivo. Repetimos aqui (idempotente)
-- pra que rebuild do zero e banco vivo cheguem no mesmo lugar.
alter table public.email_enviados enable row level security;
revoke all on public.email_enviados from anon, authenticated;
