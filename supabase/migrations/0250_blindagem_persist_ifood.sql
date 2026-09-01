-- Blindagem do persist do extrato iFood — 3 vulnerabilidades da auditoria
-- de 31/08/26 (agentes). Tudo ADITIVO: coluna nova nula + tabela nova.
-- O código em produção não conhece nada disto e segue intacto até o deploy.
--
-- 1) TROCA DE MERCHANT APAGAVA O MÊS. `ifood_financeiro_lancamentos` não
--    guardava QUAL merchant gerou cada linha, e o persist é apaga-e-regrava
--    por (unit_id, competência). Ao trocar o merchant vinculado, o extrato
--    do novo substituía o mês inteiro — os lançamentos que só existiam no
--    merchant antigo (a janela da transição) sumiam pra sempre, com log
--    `success`. A Varginha só escapou porque a competência do merchant
--    errado veio VAZIA da API. A coluna permite ao persist apagar somente
--    a carga do MESMO merchant (ou legado sem marca).
alter table public.ifood_financeiro_lancamentos
  add column if not exists merchant_id text;

comment on column public.ifood_financeiro_lancamentos.merchant_id is
  'Merchant (api_store_id) cujo extrato gerou a linha. NULL = carga anterior à 0250 ou importação manual por planilha (que cobre a loja inteira e por isso substitui tudo). O persist só apaga linhas do mesmo merchant ou NULL — linhas de OUTRO merchant são história da transição e ficam.';

-- 2) ENCOLHIMENTO SILENCIOSO. A trava de regressão só barrava queda >30%;
--    qualquer versão até 30% menor substituía o mês sem deixar rastro. O
--    aviso dá onde escrever isso sem abusar do error_message (que é de erro).
alter table public.platform_imports
  add column if not exists aviso text;

comment on column public.platform_imports.aviso is
  'Aviso não-fatal da carga (ex.: extrato encolheu N% vs a carga anterior). Preenchido em status=success; a rotina de saúde lê daqui.';

-- 3) CORRIDA SEM LOCK. Cron das 06h, coletor de ~4min e botão manual podiam
--    persistir a MESMA (loja, competência) ao mesmo tempo; o laço
--    grava→confere→apaga não é transacional e havia interleaving que deixava
--    a competência VAZIA com dois logs success. Advisory lock do Postgres não
--    serve aqui (PostgREST pooling: unlock cairia noutra conexão), então o
--    lock é uma linha com dono e validade.
create table if not exists public.import_locks (
  lock_key   text primary key,
  locked_at  timestamptz not null default now(),
  locked_by  text
);

comment on table public.import_locks is
  'Mutex por (plataforma:relatório:unit). Adquire com insert (on conflict: takeover só se locked_at velho — dono morto). Solta com delete no finally. Lock vencido (>15 min) é considerado abandonado.';

-- Só o service_role toca nisto. RLS ligada sem policy = anon/authenticated
-- bloqueados (o P0 das RPCs anônimas já voltou 2x neste projeto; tabela de
-- controle não precisa nem de leitura pública).
alter table public.import_locks enable row level security;
