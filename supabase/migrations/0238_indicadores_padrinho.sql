-- Comissão em cadeia: quem trouxe o indicador ganha uma fatia, pra sempre.
--
-- ── A REGRA (Marcus, 25/08/26) ───────────────────────────────────────────
-- O João (Tech) vai indicar clientes, e o Diego — que trouxe o João — ganha
-- junto. Três decisões dele:
--
--   • o padrinho ganha PARA SEMPRE, não só na primeira mensalidade;
--   • UM nível só. O cliente do João não sobe pro Diego se indicar alguém —
--     dois níveis viram esquema de pirâmide e ninguém audita;
--   • os 20% VIRAM 15 + 5. O custo total da indicação não muda; o que muda é
--     entre quem ele se divide.
--
-- ── E O PERCENTUAL MUDA QUANDO ELE QUISER ────────────────────────────────
-- Por isso a divisão mora no CADASTRO do indicador e não em constante no
-- código. E por isso `comissoes` já guarda `pct` e `valor` na linha: mexer no
-- cadastro vale da PRÓXIMA apuração em diante, e não reescreve o que já foi
-- apurado. Comissão apurada é dívida com data; mudar o passado porque a régua
-- de hoje é outra seria alterar quanto alguém já ganhou.
alter table public.indicadores
  add column if not exists padrinho_id uuid references public.indicadores(id) on delete set null,
  add column if not exists padrinho_pct numeric(5,2) not null default 0;

-- Na comissão INDIRETA, guarda de quem veio o cliente. Sem isso o padrinho
-- abriria a tela e veria dinheiro de um cliente que ele nunca ouviu falar.
alter table public.comissoes
  add column if not exists origem_indicador_id uuid references public.indicadores(id) on delete set null;

comment on column public.indicadores.padrinho_id is
  'Quem trouxe ESTE indicador. Ganha `padrinho_pct` de tudo que ele indicar, pra sempre. UM nivel so.';
comment on column public.indicadores.padrinho_pct is
  'Fatia do padrinho, em pontos percentuais da mensalidade paga. Sai de dentro dos 20%: 15 pro indicador + 5 pro padrinho.';
comment on column public.comissoes.origem_indicador_id is
  'Preenchido so na comissao INDIRETA: o indicador que de fato trouxe o cliente. Null = comissao direta.';
