-- Fecha RPCs `security definer` que o ANÔNIMO conseguia executar.
--
-- Achado por auditoria externa em 03/08/26 e confirmado explorando de verdade:
-- com a chave publicável (a mesma que vai no navegador de qualquer visitante,
-- por design), sem login nenhum:
--
--   POST /rest/v1/rpc/conferencia_fontes_ifood {"p_year":2026,"p_month":7}
--   → HTTP 200, 55 lojas de TODOS os clientes
--
-- `security definer` roda com o dono da função e portanto ignora RLS. Sem
-- revoke explícito, o Postgres deixa PUBLIC executar -- e no Supabase `anon` e
-- `authenticated` herdam isso. A conta de multi-tenant não fechava: a RLS das
-- tabelas estava certa, mas estas funções passavam por cima dela.
--
-- Pior: `conferencia_fontes_ifood` não recebe parâmetro de cliente (só ano e
-- mês) e devolve `unit_id` -- que é exatamente o que `lojas_sem_dado` e
-- `fechamento_mes_faltando` pedem de entrada. Dava pra encadear. E
-- `resumo_semanal` devolve faturamento bruto e loja destaque por holding.
--
-- Foi descuido nosso e é sistemático: a 0150 (escrita no mesmo dia) revoga
-- corretamente, a 0149 não. REGRA daqui pra frente: toda função
-- `security definer` nasce com revoke de public/anon/authenticated e grant só
-- pro papel que precisa. O linter do Supabase cobre isso
-- (0028_anon_security_definer_function_executable) -- vale rodar no CI.
--
-- Verificado antes de aplicar: as 6 são chamadas por `createAdminClient()`
-- (service_role), exceto `touch_last_seen`, que roda com a sessão do usuário em
-- app/(app)/layout.tsx e por isso mantém `authenticated`.

revoke execute on function public.conferencia_fontes_ifood(integer, integer) from public, anon, authenticated;
grant  execute on function public.conferencia_fontes_ifood(integer, integer) to service_role;

revoke execute on function public.fechamento_mes_faltando(uuid[], integer, integer) from public, anon, authenticated;
grant  execute on function public.fechamento_mes_faltando(uuid[], integer, integer) to service_role;

revoke execute on function public.lojas_sem_dado(uuid[]) from public, anon, authenticated;
grant  execute on function public.lojas_sem_dado(uuid[]) to service_role;

revoke execute on function public.resumo_semanal(uuid, date, date) from public, anon, authenticated;
grant  execute on function public.resumo_semanal(uuid, date, date) to service_role;

revoke execute on function public.usuarios_com_mfa() from public, anon, authenticated;
grant  execute on function public.usuarios_com_mfa() to service_role;

-- `touch_last_seen` já checa auth.uid() por dentro, mas anônimo não tem o que
-- fazer chamando: sai do PUBLIC/anon e fica só pra sessão logada.
revoke execute on function public.touch_last_seen() from public, anon;
grant  execute on function public.touch_last_seen() to authenticated, service_role;
