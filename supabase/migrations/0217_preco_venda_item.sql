-- Ficha Técnica: o preço de VENDA (de tabela), digitado pela operação.
--
-- ── POR QUE PRECISA SER DIGITADO ─────────────────────────────────────────
-- O iFood não entrega preço de cardápio em lugar nenhum: o módulo Catalog da
-- Merchant API responde 403 pro nosso app (testado nos dois apps em 17/08/26,
-- com /merchant respondendo 200 no mesmo token — logo é falta de módulo, não
-- da loja), e o relatório de Cardápio traz só quantidade e valor total. A
-- Keeta dá desconto por PEDIDO, não por item. Só 99 Food e Cardápio Web têm
-- preço de tabela no nosso banco hoje.
--
-- Como a coluna precisa existir pras quatro plataformas, ela é digitada. Onde
-- houver dado de origem (99 / CW), dá pra pré-preencher depois — a coluna já
-- fica pronta pra isso.
--
-- ⚠️ NULL ≠ 0, pela mesma razão do `custo` na 0215: preço zero é um valor
-- legítimo (brinde, item de combo) e não pode ser confundido com "ninguém
-- preencheu". Quem lê tem que testar `is null`, nunca `= 0`.
alter table public.item_custos
  add column if not exists preco_venda numeric;

comment on column public.item_custos.preco_venda is
  'Preço de tabela do item, digitado pela operação. NULL = não preenchido; '
  'zero é um preço válido. Serve pra medir o desconto contra o preço médio '
  'realizado (receita ÷ quantidade) — NÃO entra na conta da margem, que '
  'continua sobre o que realmente entrou.';

-- A linha passa a poder existir só com o preço (sem custo ainda), então o
-- índice de "tem algo preenchido" cobre os dois.
create index if not exists item_custos_preco_venda_idx
  on public.item_custos (unit_id, platform)
  where preco_venda is not null;
