-- Itens vendidos da 99 Food, extraídos do webhook de pedido.
--
-- POR QUE ISTO EXISTE: o payload de `orderNew` sempre trouxe a comanda inteira
-- (`data.order_info.order_items[]` com nome, quantidade e preço), e o
-- processador lia esse array só pra contar o tamanho:
--
--     contagem_item: Array.isArray(info.order_items) ? info.order_items.length : 0
--
-- Nome e quantidade de cada prato eram descartados na entrada. Enquanto isso a
-- Ficha Técnica pedia ao cliente que exportasse a planilha "Dados do item" no
-- portal da 99 — pra reconstruir à mão um dado que já estava no nosso banco,
-- guardado cru em `ninefood_webhook_events.payload` desde 11/jun/2026.
--
-- ⚠️ TABELA SEPARADA DE `ninefood_daily_item`, de propósito. Aquela é destino
-- da PLANILHA e é reescrita com delete+insert por loja/período a cada upload:
-- gravar o dado de API lá dentro faria uma fonte apagar a outra, nos dois
-- sentidos. Aqui o grão também é diferente e mais fiel — item por PEDIDO, como
-- a 99 manda, e não agregado por dia. Quem lê agrega; quem agrega antes de
-- guardar joga fora o que não dá pra recuperar depois.
--
-- Espelha `cardapioweb_pedido_itens`, que resolve o mesmo problema no canal
-- próprio — inclusive em guardar o complemento (`kind='opcao'`), que consome
-- insumo igual ao item principal e por isso pesa na ficha.
--
-- NÃO guarda NADA de cliente. O payload traz CPF, telefone e endereço; deste
-- lado entra só o que é venda.

create table if not exists public.ninefood_pedido_itens (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  order_id      text not null,
  /* 'item' = linha da comanda; 'opcao' = complemento dentro dela. */
  kind          text not null default 'item' check (kind in ('item', 'opcao')),
  /* Posição na comanda. Com `parent_index` forma a identidade da linha, que é
     o que torna o backfill repetível sem duplicar. */
  item_index    integer not null,
  parent_index  integer not null default -1,
  nome_item     text not null,
  /* Nome do GRUPO do complemento ("Molhos da Casa"). Null em item principal. */
  grupo         text,
  quantidade    numeric not null default 1,
  /* Reais. A 99 manda centavos; a conversão fica na escrita pra tela e
     relatório nunca dividirem por 100 cada um por conta própria. */
  preco_unitario numeric,
  valor_total    numeric,
  /* O que o cliente pagou de fato na linha (depois do desconto da promoção).
     `valor_total` é a soma cheia — os dois juntos mostram o custo do desconto. */
  valor_pago     numeric,
  data          date not null,
  ref_year      integer not null,
  ref_month     integer not null,
  app_item_id   text,
  criado_em     timestamptz not null default now()
);

-- Idempotência do backfill e do sync: reprocessar o mesmo evento não duplica.
create unique index if not exists ninefood_pedido_itens_linha_idx
  on public.ninefood_pedido_itens (order_id, kind, parent_index, item_index);

-- O acesso é sempre "loja × mês", igual ao resto do módulo.
create index if not exists ninefood_pedido_itens_unit_mes_idx
  on public.ninefood_pedido_itens (unit_id, ref_year, ref_month);

alter table public.ninefood_pedido_itens enable row level security;

-- Leitura vem sempre pelo servidor (service_role), como nas irmãs desta tabela.
revoke all on public.ninefood_pedido_itens from anon, authenticated;

comment on table public.ninefood_pedido_itens is
  'Itens vendidos da 99 Food, extraídos do webhook orderNew. Fonte AUTOMÁTICA — '
  'a planilha "Dados do item" (ninefood_daily_item) continua existindo para as '
  'lojas sem webhook e para o histórico anterior a ele.';
