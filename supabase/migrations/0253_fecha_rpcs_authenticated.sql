-- Fecha pro `authenticated` as SECURITY DEFINER que só o servidor chama.
--
-- Varredura de 01/set/2026: 8 funções SECURITY DEFINER tinham EXECUTE pro
-- papel `authenticated`. SECURITY DEFINER ignora RLS, então qualquer usuário
-- logado (ex.: um franqueado de OUTRO cliente) podia chamar estas RPCs pelo
-- PostgREST com unit_ids alheios e ler faturamento de quem não é dele.
--
-- Checado antes de revogar (exigência do Marcus): grep em src/ confirmou que
-- TODAS as 7 abaixo são chamadas exclusivamente via createAdminClient()
-- (service_role) — nenhuma tela usa o client da sessão do usuário pra elas.
-- Revogar não quebra nada.
--
-- ⚠️ `touch_last_seen()` fica DE FORA de propósito: ela carimba o
-- last_seen_at do PRÓPRIO usuário (auth.uid() checado por dentro) e é chamada
-- pelo client logado. Revogá-la mataria o "último acesso" — que já mordeu
-- duas vezes neste projeto (ver memória "último acesso ≠ último login").
revoke execute on function public.cardapioweb_resumo_installs() from public, anon, authenticated;
grant  execute on function public.cardapioweb_resumo_installs() to service_role;

revoke execute on function public.ifood_adotar_solicitacoes_orfas() from public, anon, authenticated;
grant  execute on function public.ifood_adotar_solicitacoes_orfas() to service_role;

revoke execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) from public, anon, authenticated;
grant  execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) to service_role;

revoke execute on function public.ifood_pedidos_resumo_by_units(uuid[], integer, integer, date, date) from public, anon, authenticated;
grant  execute on function public.ifood_pedidos_resumo_by_units(uuid[], integer, integer, date, date) to service_role;

revoke execute on function public.ninefood_custo_entrega_by_units(uuid[], integer, integer) from public, anon, authenticated;
grant  execute on function public.ninefood_custo_entrega_by_units(uuid[], integer, integer) to service_role;

revoke execute on function public.vendas_por_dia_semana(uuid[], date, date) from public, anon, authenticated;
grant  execute on function public.vendas_por_dia_semana(uuid[], date, date) to service_role;

revoke execute on function public.vendas_por_dia_semana(uuid[], date, date, text[]) from public, anon, authenticated;
grant  execute on function public.vendas_por_dia_semana(uuid[], date, date, text[]) to service_role;
