-- Fila durável de "vinculada, mas o histórico nunca foi puxado".
--
-- O backfill existia, mas só alcançava as lojas vinculadas NAQUELA rodada
-- (`link.vinculadas`). Loja vinculada pelo cron de 15 min, pelo botão
-- "conferir e vincular" ou pelo sync manual nunca mais aparecia na lista — e
-- ficava só com "mês corrente + anterior", para sempre, sem ninguém notar.
--
-- Foi o caso da Pizzaria Quero Mais (Vbfood): conectada, iFood ativo, e só
-- julho e agosto no banco. Os outros 6 meses (R$ 47 mil de repasse) só
-- entraram porque alguém foi olhar. A fila revelou mais 6 lojas da DG FOODS na
-- mesma situação — duas delas com UM único mês.
--
-- Com o carimbo, a fila deixa de depender de quem vinculou e de quando: vira
-- ESTADO, não evento.
alter table public.unit_platforms
  add column if not exists historico_backfill_at timestamptz;

comment on column public.unit_platforms.historico_backfill_at is
  'Quando o histórico completo (desde jan/2026) foi puxado. Null + conectada = está na fila do backfill.';

-- Quem já tem mais de 2 meses evidentemente já foi backfillado: evita a
-- correção disparar o puxão do ano inteiro em toda a base de uma vez.
update public.unit_platforms up
set historico_backfill_at = now()
where up.historico_backfill_at is null
  and up.platform = 'ifood'
  and exists (
    select 1 from ifood_financeiro_lancamentos l
    where l.unit_id = up.unit_id
    group by l.unit_id
    having count(distinct to_char(l.data_fato_gerador, 'YYYY-MM')) > 2
  );
