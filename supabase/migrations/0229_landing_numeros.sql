-- Os números da prova social da landing, calculados uma vez por dia.
--
-- ── POR QUE UMA TABELA, E NÃO UMA CONTA NA HORA ──────────────────────────
-- A conta é cara: o bruto do iFood sai de `ifood_financeiro_resumo_by_units`,
-- uma competência por chamada, ~5s cada. Medido em 24/08/26: 41 SEGUNDOS pro
-- conjunto. Fazer isso no render da landing (que é página pública, aberta por
-- gente que nunca vai logar) travaria a primeira visita a cada expiração de
-- cache — e cache que expira é exatamente onde o custo aparece pro visitante.
--
-- Então o cron calcula e grava; a página lê UMA linha.
--
-- ── POR QUE PAROU DE SER DIGITADO À MÃO ──────────────────────────────────
-- Era. O conjunto anterior (R$ 9,4 mi / 164 mil / 83 lojas) ficou meses no ar
-- enquanto o real dobrava, e nada avisava — número velho não dá erro, só
-- vende menos do que a empresa é.
--
-- ── A REGRA QUE NÃO PODE SE PERDER ───────────────────────────────────────
-- A rede de DEMONSTRAÇÃO fica de fora de tudo. Os dados dela são fictícios, e
-- prova social com loja inventada dentro não é prova. Quem calcula é
-- `src/lib/data/landing-numeros.ts`, e é lá que essa exclusão está aplicada.
create table if not exists public.landing_numeros (
  -- Linha única. O `check` é o que garante isso: sem ele, um upsert com
  -- conflito mal escrito criaria uma segunda linha e a página passaria a ler
  -- "alguma" delas, em silêncio.
  id boolean primary key default true check (id),
  vendas numeric not null default 0,
  pedidos bigint not null default 0,
  lojas integer not null default 0,
  avaliacoes bigint not null default 0,
  taxas numeric not null default 0,
  estados integer not null default 0,
  calculado_em timestamptz not null default now()
);

alter table public.landing_numeros enable row level security;

-- Sem policy: só o service_role (que ignora RLS) lê e escreve. A landing é
-- Server Component e lê pelo admin client — o número nunca é buscado pelo
-- navegador, então não há motivo pra expor a tabela ao anon.

comment on table public.landing_numeros is
  'Números da prova social da landing (deliveryos.food), recalculados uma vez por dia pelo cron. Rede de demonstração sempre excluida.';
