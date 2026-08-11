-- Texto da resposta que a loja deu à avaliação.
--
-- A API do iFood devolve `replies[]` com { text, from, createdAt } tanto na
-- lista quanto no detalhe, e a gente guardava só o `status` (REPLIED /
-- NOT_REPLIED). Saber QUE respondeu sem saber O QUE respondeu não ajuda
-- ninguém: quem gerencia rede precisa ver se a resposta foi boa, e quem não
-- respondeu precisa achar as pendentes.
--
-- ⚠️ Preenche do próximo sync em diante. O histórico não volta: a API devolve
-- as respostas atuais, então avaliação antiga só ganha o texto se entrar de
-- novo na janela do sync.
--
-- `respondida_em` é do iFood (createdAt da resposta), não nosso — serve pra
-- medir quanto a loja demora a responder, que é métrica de reputação.

alter table public.ifood_avaliacoes
  add column if not exists resposta_texto text,
  add column if not exists respondida_em timestamptz;

comment on column public.ifood_avaliacoes.resposta_texto is
  'Texto da resposta da loja (replies[].text da API). Nulo = sem resposta.';
comment on column public.ifood_avaliacoes.respondida_em is
  'Quando a loja respondeu, pelo relógio do iFood (replies[].createdAt).';

-- Achar as não respondidas é a consulta que a tela faz o tempo todo.
create index if not exists ifood_avaliacoes_sem_resposta_idx
  on public.ifood_avaliacoes (unit_id, data_avaliacao desc)
  where resposta_texto is null;
