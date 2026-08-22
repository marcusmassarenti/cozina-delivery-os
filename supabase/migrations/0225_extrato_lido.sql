-- Registro de que o extrato de uma loja FOI LIDO — mesmo quando veio vazio.
--
-- O problema que ele resolve: até aqui o sistema só guardava o RESULTADO (as
-- linhas do financeiro). Com isso, "não buscamos o arquivo" e "buscamos e a
-- loja não vendeu" produziam exatamente o mesmo silêncio no banco — e o
-- diagnóstico de saúde tratava os dois como a mesma coisa.
--
-- São situações opostas: a primeira é defeito nosso e pede conserto; a segunda
-- é um fato sobre o negócio do cliente e não deveria acordar ninguém. Medido
-- em 22/08/26: das 6 lojas "atrasadas há mais de 3 dias", 5 simplesmente não
-- venderam (a Chapa Quente não tem pedido desde 17/jul).
--
-- Granularidade é a COMPETÊNCIA, não o dia, porque é assim que o iFood entrega:
-- um extrato por mês, contendo o mês inteiro até ali. Saber que o extrato de
-- agosto foi lido com sucesso hoje às 06:12 já responde a pergunta — o que
-- vier faltando depois da última data de lançamento é ausência de venda.
create table if not exists public.ifood_extrato_lido (
  unit_id uuid not null references public.units(id) on delete cascade,
  competencia text not null,
  lido_em timestamptz not null default now(),
  -- Linhas que o extrato trouxe. Zero é resposta legítima: mês sem operação.
  linhas integer not null default 0,
  primary key (unit_id, competencia)
);

create index if not exists ifood_extrato_lido_em_idx
  on public.ifood_extrato_lido (lido_em desc);

alter table public.ifood_extrato_lido enable row level security;
revoke all on public.ifood_extrato_lido from anon, authenticated;

comment on table public.ifood_extrato_lido is
  'Carimbo de leitura do extrato por loja e competência. Existe para separar "não sincronizou" de "não vendeu" — sem ele, os dois casos são o mesmo silêncio.';
