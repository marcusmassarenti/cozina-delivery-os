/*
 * Resposta automática — cortesia POR LOJA e o feedback das respostas
 * (Marcus, 25/09/26).
 *
 * 1. `units.resposta_auto_cortesia`: a loja ligada não entra no adicional.
 *    Existe porque o preço 0 do cliente (holdings.resposta_auto_preco_loja)
 *    deixaria TODAS as lojas dele de graça — e o pedido foi "a Koike como
 *    cortesia", não a DG inteira. Quem soma é `adicionalRespostaAuto`.
 *
 * 2. Feedback do cliente sobre cada resposta publicada: 👍/👎 e "como eu
 *    teria respondido". Não edita o que foi pro iFood (o iFood só deixa editar
 *    por 10 min) — serve pra IA aprender o tom de cada cliente: as aprovadas e
 *    as corrigidas viram exemplo na próxima resposta.
 */

alter table public.units
  add column if not exists resposta_auto_cortesia boolean not null default false;

comment on column public.units.resposta_auto_cortesia is
  'Resposta automática ligada sem cobrança nesta loja (não entra no adicional).';

alter table public.ifood_avaliacoes
  add column if not exists resposta_feedback smallint
    check (resposta_feedback in (-1, 1)),
  add column if not exists resposta_feedback_texto text
    check (resposta_feedback_texto is null or char_length(resposta_feedback_texto) <= 600),
  add column if not exists resposta_feedback_por uuid references auth.users(id) on delete set null,
  add column if not exists resposta_feedback_em timestamptz;

comment on column public.ifood_avaliacoes.resposta_feedback is
  'Avaliação do cliente sobre a resposta automática: 1 = boa, -1 = ruim.';
comment on column public.ifood_avaliacoes.resposta_feedback_texto is
  'Como o cliente teria respondido — vira exemplo de tom para a IA.';

-- Lista "Respondidas automaticamente" e os exemplos de estilo por loja.
create index if not exists ifood_avaliacoes_resp_auto_idx
  on public.ifood_avaliacoes (unit_id, respondida_em desc)
  where resposta_origem in ('ia', 'modelo');
