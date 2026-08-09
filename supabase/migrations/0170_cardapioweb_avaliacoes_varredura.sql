-- Marca quando a varredura profunda de avaliações já foi feita.
--
-- O gatilho era "tenho zero avaliações guardadas → varre 3 anos". Loja que
-- genuinamente não tem avaliação nenhuma nunca sai desse estado e refaz a
-- varredura inteira TODO DIA, para sempre. Medido em 08/08/26: uma instalação
-- gastou 24 chamadas em 3 dias, todas devolvendo total_reviews: 0. Com 30
-- lojas assim seriam ~240 chamadas por dia jogadas fora.
--
-- "Não tenho dado" não é o mesmo que "nunca procurei". Este carimbo guarda a
-- segunda informação, que é a que importa.
alter table public.cardapioweb_sync_state
  add column if not exists avaliacoes_varredura_em timestamptz;

comment on column public.cardapioweb_sync_state.avaliacoes_varredura_em is
  'Quando a varredura profunda de avaliações rodou. Null = nunca — só aí vale varrer 3 anos.';

-- Quem já tem avaliação guardada evidentemente já varreu: evita que a
-- correção dispare uma varredura profunda em todas as lojas de uma vez.
update public.cardapioweb_sync_state s
set avaliacoes_varredura_em = now()
where s.avaliacoes_varredura_em is null
  and exists (
    select 1 from public.cardapioweb_avaliacoes a where a.install_id = s.install_id
  );
