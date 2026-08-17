-- `item_custos.custo` passa a aceitar NULL.
--
-- ⚠️ BUG VISTO NA TELA: classificar a categoria de um item criava a linha com
-- custo = 0 (o default da coluna). O item passava a contar como "preenchido",
-- entrava na margem com custo zero e aparecia como lucro integral — o oposto do
-- que a tela promete, e em silêncio.
--
-- A coluna nasceu `not null default 0` porque parecia inofensivo. Não é: ZERO é
-- um custo válido (item de cortesia, brinde), então zero não pode significar
-- "vazio". A ausência precisa ser representável, e a representação disso é NULL.
alter table public.item_custos alter column custo drop not null;
alter table public.item_custos alter column custo drop default;

comment on column public.item_custos.custo is
  'Custo por unidade vendida. NULL = ninguém preencheu. Zero é um custo válido — ver o cabeçalho da migration 0215.';

-- Os zeros que existem hoje vieram justamente desse bug (linhas criadas só pra
-- guardar categoria). Nenhum cliente chegou a digitar zero de propósito.
update public.item_custos set custo = null where custo = 0;
