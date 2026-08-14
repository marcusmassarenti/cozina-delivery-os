-- Lembra qual pedido de extrato já está vigente, pra não perguntar de novo.
--
-- O iFood aceita 1 pedido novo por (loja, competência) a cada 6h. Passou
-- disso, ele responde 409 com a frase "There is already a recent and valid
-- request Id: <uuid>" — e a gente lê o id de dentro da mensagem e segue.
-- Funciona, mas o preço é uma chamada 4xx pra descobrir uma coisa que já
-- sabíamos: medido em 13/08/2026, 1.253 dos 3.746 erros de 30 dias eram
-- exatamente isso.
--
-- Guardando o id aqui, a segunda tentativa dentro da janela não chama o iFood.
-- Não é só cosmética de métrica: o teto de requisições do iFood é por
-- APLICATIVO, então chamada desperdiçada numa loja tira a vez de outra.
create table if not exists ifood_reconciliation_pedidos (
  merchant_id text not null,
  competencia text not null,
  request_id  text not null,
  criado_em   timestamptz not null default now(),
  primary key (merchant_id, competencia)
);

-- A validade é do iFood (6h), não nossa: guardamos o instante e quem lê
-- decide. Um TTL gravado aqui viraria mentira no dia em que eles mudarem.
comment on table ifood_reconciliation_pedidos is
  'requestId vigente do extrato sob demanda por (loja, competência). Janela de reuso do iFood = 6h a partir de criado_em.';

create index if not exists ifood_reconciliation_pedidos_criado_idx
  on ifood_reconciliation_pedidos (criado_em desc);
