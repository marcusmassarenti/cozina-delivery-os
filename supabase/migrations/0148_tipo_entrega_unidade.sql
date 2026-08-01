-- Quem entrega: a loja ou a plataforma (aplicada via MCP, 0148).
-- Não é detalhe de cadastro — muda a leitura do dinheiro. Em entrega própria o
-- iFood nomeia a comissão de outro jeito, o frete cobrado do cliente entra no
-- caixa da loja, e o "% que fica na loja" tem outro patamar.
alter table public.units add column if not exists tipo_entrega text;
alter table public.units drop constraint if exists units_tipo_entrega_check;
alter table public.units add constraint units_tipo_entrega_check
  check (tipo_entrega is null or tipo_entrega in ('propria','plataforma','ambas'));
