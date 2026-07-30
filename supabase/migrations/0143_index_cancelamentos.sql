-- Índice parcial para as duas leituras de cancelamento do dashboard.
-- Aplicada em produção via MCP (0143).
--
-- Elas varriam a tabela inteira (~700 mil linhas) pra achar os cancelamentos do
-- mês, que são poucas centenas. Com a base pequena passava; depois que a DG
-- Foods entrou com 40 lojas, as duas passaram a estourar o statement timeout —
-- e como o tratamento de erro é console.error + break, o dashboard mostrava
-- número de cancelamento INCOMPLETO sem avisar ninguém.
--
-- Medido depois: 8,5 ms (antes: timeout).
create index if not exists ifood_fin_lanc_cancelamento_idx
  on public.ifood_financeiro_lancamentos (ref_year, ref_month, unit_id, id)
  where fato_gerador in ('Cancelamento Total', 'Cancelamento Parcial');
