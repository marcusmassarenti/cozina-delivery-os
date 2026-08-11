-- Conserta duas frestas que a 0183 abriu. O gate de CI pegou as duas — é
-- exatamente pra isso que ele existe.
--
-- 1. A TABELA nasceu sem RLS. Toda tabela em `public` é exposta pelo PostgREST;
--    sem RLS, qualquer chave anônima lê o tamanho do banco e a lista das
--    maiores tabelas. Não é dado de cliente, mas é mapa da casa — e o gate
--    marca como ERROR com razão.
--
--    Sem policy de propósito: isto é tabela de servidor. O cron escreve com
--    service_role (que ignora RLS) e nenhuma tela lê. RLS ligada + zero policy
--    = ninguém entra, que é o estado desejado.
alter table public.infra_metricas_diarias enable row level security;

-- 2. A FUNÇÃO continuava executável pelo `authenticated`.
--    Meu revoke da 0183 cobriu `public, anon` e parou aí. No Supabase o papel
--    `authenticated` recebe EXECUTE por default privilege PRÓPRIO — revogar de
--    PUBLIC não tira o dele. Resultado: qualquer usuário logado, de qualquer
--    cliente, podia perguntar quanto pesa a base inteira.
--
--    Quem chama isto é o cron, com service_role. Ninguém logado precisa.
revoke all on function public.infra_metricas() from authenticated;
