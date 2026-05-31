--------------------------------------------------------------------
-- 0022_financeiro_cobertura_index.sql
-- Índice parcial pra acelerar o RPC ifood_financeiro_cobertura (0013),
-- usado pela tela de Cobertura.
--
-- Sintoma: com ~200k lançamentos, o RPC varria a tabela inteira (linhas
-- largas, 28 colunas) filtrando fato_gerador='Venda' sem filtro de loja,
-- e estourava o statement_timeout (22–87s). A coluna Financeiro do iFood
-- na Cobertura ficava vazia pra todas as lojas.
--
-- Fix: índice parcial só das linhas de Venda, ordenado por
-- (ref_year, ref_month, unit_id) e incluindo data_fato_gerador. Assim o
-- RPC faz um index-only scan (lê só 4 colunas estreitas, já agrupadas),
-- em vez de ler 200k linhas largas do heap.
--------------------------------------------------------------------

create index if not exists ix_ifood_financeiro_cobertura
  on public.ifood_financeiro_lancamentos (
    ref_year,
    ref_month,
    unit_id,
    data_fato_gerador
  )
  where fato_gerador = 'Venda';

-- Atualiza estatísticas do planner depois do backfill em massa.
analyze public.ifood_financeiro_lancamentos;
