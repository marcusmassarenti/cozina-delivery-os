-- Receita própria: venda que NUNCA passou por plataforma.
--
-- Balcão, salão, telefone, WhatsApp direto, encomenda. É dinheiro que a loja
-- fatura e que nenhum relatório de iFood, 99, Keeta ou Cardápio Web enxerga —
-- então o sistema mostrava a loja faturando menos do que ela fatura, e a DRE
-- terminava num "resultado da loja" que era só o resultado do delivery.
--
-- ⚠️ NÃO confundir com a linha "Venda direta (dinheiro / PIX / maquininha)"
-- que já existe na DRE. Aquela é pedido DA PLATAFORMA pago na entrega: ele
-- entra no bruto pelo relatório e sai do repasse, porque o entregador já
-- deixou o dinheiro na loja. São coisas diferentes e as duas convivem.
--
-- Mora em monthly_entries, ao lado de CMV e custo operacional, porque é o
-- mesmo gesto: um número por loja por mês que a pessoa lança à mão. Sem tabela
-- nova e sem tela nova.
--
-- CONSEQUÊNCIA ACEITA (decisão do Marcus, 12/ago/26): entra no faturamento
-- bruto do sistema INTEIRO — dashboard, ranking, DRE Grupo, Nino, metas. Ou
-- seja, o bruto passa a significar "quanto a loja vendeu" e deixa de bater com
-- o portal do iFood, que era regra anterior. Quem quiser só plataforma tem o
-- filtro por plataforma, que ignora esta coluna.

alter table public.monthly_entries
  add column if not exists receita_propria numeric not null default 0;

comment on column public.monthly_entries.receita_propria is
  'Venda fora das plataformas (balcão, salão, telefone, WhatsApp), lançada à '
  'mão pela loja. Soma ao faturamento bruto. NÃO é a "venda direta" da DRE, '
  'que é pedido de plataforma pago na entrega.';
