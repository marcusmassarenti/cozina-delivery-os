-- 0083 · Segurança: tranca as RPCs de financeiro (SECURITY DEFINER) só no service_role
--
-- Estas 6 funções são SECURITY DEFINER (rodam como dono e BYPASSAM o RLS).
-- Elas filtram apenas pelos unit_ids que o CHAMADOR passa, sem checar acesso.
-- Enquanto tiverem EXECUTE para public/anon/authenticated, qualquer um pode
-- passar unit_ids de outro tenant e ler o financeiro alheio (faturamento,
-- taxas, CMV, margem):
--   * via `anon` (a anon key é pública, vai no bundle) → sem nem logar;
--   * via `authenticated` → qualquer franqueado logado, de qualquer empresa.
-- Obs.: EXECUTE é concedido a PUBLIC por padrão no Postgres, então revogar
-- só do `anon` não basta — o anon herda via PUBLIC. Revogamos de PUBLIC também.
--
-- O app SEMPRE chama estas funções pelo client service_role (createAdminClient),
-- que já é escopado na camada de dados (getAccessibleUnitIds). Logo, deixar
-- apenas o service_role NÃO quebra nenhuma tela e fecha o vazamento cross-tenant.

do $$
declare
  sig text;
  sigs text[] := array[
    'public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date)',
    'public.ifood_financeiro_cobertura(integer, integer, integer, integer)',
    'public.ifood_financeiro_diario_by_units(uuid[], integer, integer)',
    'public.ifood_taxa_entrega_by_units(uuid[], integer, integer)',
    'public.keeta_taxa_entrega_by_units(uuid[], integer, integer)',
    'public.ninefood_custo_entrega_by_units(uuid[], integer, integer)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke execute on function %s from public, anon, authenticated;', sig);
    execute format('grant execute on function %s to service_role;', sig);
  end loop;
end $$;
