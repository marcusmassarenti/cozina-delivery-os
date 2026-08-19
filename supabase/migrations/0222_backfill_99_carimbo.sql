-- 0222 — carimbo de "o histórico do 99 fechou".
--
-- POR QUE: o e-mail "sua loja está conectada" leva os números dentro, e sai
-- UMA VEZ SÓ. Mandá-lo no meio da carga apresenta meia verdade como total do
-- ano — foi o que aconteceu com a CR Poços em 18/08/26: o e-mail saiu com
-- R$ 22.225,18 / fev a ago, enquanto o histórico fechado tinha R$ 69.353,77 /
-- jan a ago. A partir daqui o e-mail espera o histórico fechar.
--
-- O iFood já tinha o sinal (unit_platforms.historico_backfill_at) e o Cardápio
-- Web também (cardapioweb_sync_state.backfill_concluido). O 99 não tinha
-- nenhum: o cron dele só cobre mês corrente + anterior, então loja nova ficava
-- para sempre "carregando" sem ninguém puxar o resto. Esta coluna é o sinal, e
-- o cron do 99 passa a ser quem a carimba.
alter table public.ninefood_store_links
  add column if not exists historico_backfill_at timestamptz;

comment on column public.ninefood_store_links.historico_backfill_at is
  'Quando o backfill do histórico terminou (do limite mais antigo da API até hoje). NULL = ainda falta puxar; o e-mail de conexão espera isto.';

-- As lojas de hoje já foram varridas à mão com ?desde=2026-01 (e as da conta
-- demo nascem semeadas). Carimbar evita que a próxima rodada refaça tudo.
update public.ninefood_store_links
   set historico_backfill_at = now()
 where historico_backfill_at is null;
