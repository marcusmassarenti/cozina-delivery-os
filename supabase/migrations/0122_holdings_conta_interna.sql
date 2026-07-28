--------------------------------------------------------------------
-- 0122_holdings_conta_interna.sql
--
-- Marca a conta da própria casa pra ela sair das métricas de receita.
--
-- A Cozina Foods é a rede do dono da plataforma: R$ 807/mês que sai do
-- bolso dele e volta pro bolso dele. Somar isso no MRR infla a receita
-- do SaaS com dinheiro que não é receita — e o MRR é justamente o número
-- que se olha pra decidir se o negócio anda.
--
-- Não é o mesmo que apagar: a conta continua na lista, com selo, porque
-- ela É uso real da plataforma (13 lojas, 92 mil pedidos) e escondê-la
-- distorceria a leitura de uso na direção oposta.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists conta_interna boolean not null default false,
  add column if not exists conta_interna_nota text;

comment on column public.holdings.conta_interna is
  'Conta da propria casa: fica FORA do MRR, do ARPA e da emissao de faturas. '
  'Continua visivel na lista com selo, porque some-la esconderia uso real da '
  'plataforma.';
comment on column public.holdings.conta_interna_nota is
  'Por que e interna e o que se pretende fazer com ela (ex.: virar cobranca de '
  'outro cliente no futuro).';
