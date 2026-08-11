-- O id da avaliação no iFood.
--
-- Guardávamos a avaliação inteira sem guardar o identificador dela — dava pra
-- LER, nunca pra AGIR. Responder é POST /reviews/{reviewId}/answers, então sem
-- este campo o painel só saberia responder redescobrindo a avaliação na API a
-- cada clique (paginar a lista toda até achar o pedido).
--
-- ⚠️ Preenche do próximo sync em diante, igual resposta_texto. Avaliação antiga
-- fica sem — a tela só oferece "Responder" onde há review_id.

alter table public.ifood_avaliacoes
  add column if not exists review_id text;

comment on column public.ifood_avaliacoes.review_id is
  'id da avaliação no iFood — necessário pra responder pela API.';

-- Não é unique: o mesmo review_id não se repete, mas um índice único aqui
-- criaria uma segunda chave de conflito no upsert, que já usa
-- (unit_id, pedido_id_longo). Duas chaves e o upsert passa a falhar em vez de
-- atualizar quando as duas divergem.
create index if not exists ifood_avaliacoes_review_id_idx
  on public.ifood_avaliacoes (review_id)
  where review_id is not null;
