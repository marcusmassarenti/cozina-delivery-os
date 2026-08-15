-- Autovacuum sob medida para as tabelas que são REESCRITAS todo dia.
--
-- ── O PROBLEMA ────────────────────────────────────────────────────────────
-- `ifood_financeiro_lancamentos` não cresce por acumular dado novo: o extrato
-- do mês corrente é rebaixado e regravado INTEIRO a cada sync. Medido em
-- 15/08/2026: 314 mil linhas inseridas num único dia, numa tabela de 1,8
-- milhão — quase tudo substituindo o que já estava lá.
--
-- Cada reescrita deixa a versão antiga como linha morta até o autovacuum
-- passar. Com o padrão do Postgres (scale_factor 0,2), o gatilho dessa tabela
-- é 50 + 0,2 × 1.817.264 = ~363 MIL linhas mortas. Ela vivia com 279 mil
-- acumuladas (13,3% da tabela) sem nunca alcançar o limite — o vacuum rodava
-- tarde, e o disco carregava o lixo no meio-tempo.
--
-- ── O AJUSTE ──────────────────────────────────────────────────────────────
-- scale_factor de 0,02 baixa o gatilho para ~46 mil linhas: o vacuum passa a
-- rodar várias vezes ao dia, em porções pequenas, em vez de uma faxina enorme
-- de vez em quando. `cost_limit` de 1000 (5× o padrão) evita que ele fique
-- para trás justamente durante o sync, que é quando a sujeira aparece.
--
-- ⚠️ TEM CUSTO: vacuum mais frequente e mais rápido consome mais I/O. É uma
-- troca consciente — o I/O da reescrita já acontece de qualquer forma, e a
-- alternativa é pagar disco por lixo. Se a latência das telas piorar, o
-- primeiro a reduzir é o `cost_limit`, não o `scale_factor`.
--
-- `analyze_scale_factor` junto porque as estatísticas envelhecem na mesma
-- velocidade: o planejador precisa saber que o mês corrente mudou, senão
-- escolhe plano ruim nas telas que filtram por competência.
alter table public.ifood_financeiro_lancamentos set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 10000,
  autovacuum_vacuum_cost_limit = 1000,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold = 10000
);

-- Mesma doença, escala menor: os pedidos do mês também são regravados a cada
-- sync (upsert por (unit_id, pedido_id)). Gatilho padrão aqui seria ~56 mil.
alter table public.ifood_pedidos set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 5000,
  autovacuum_analyze_scale_factor = 0.05
);

-- Log de chamada: escreve muito e nunca atualiza, mas o expurgo diário
-- (14 dias, ver src/lib/manutencao/expurgo-logs.ts) apaga em lote — e é o
-- lote que precisa ser recolhido rápido pra tabela não voltar a inchar.
alter table public.ifood_api_logs set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 5000
);
