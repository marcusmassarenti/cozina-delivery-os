-- Lojas que declararam uma plataforma no cadastro e NUNCA trouxeram dado.
-- Aplicada em produção via MCP (migration 0140). Cópia versionada.
create or replace function public.lojas_sem_dado(p_unit_ids uuid[])
returns table(unit_id uuid, plataforma text)
language sql stable security definer set search_path to 'public' as $$
  select up.unit_id, up.platform
  from unit_platforms up
  where up.unit_id = any(p_unit_ids)
    and up.active
    and case up.platform
      when 'ifood' then not exists (select 1 from ifood_financeiro_lancamentos x where x.unit_id = up.unit_id)
        and not exists (select 1 from ifood_pedidos x where x.unit_id = up.unit_id)
      when '99food' then not exists (select 1 from ninefood_daily_loja x where x.unit_id = up.unit_id)
        and not exists (select 1 from ninefood_pedidos x where x.unit_id = up.unit_id)
      when 'keeta' then not exists (select 1 from keeta_daily_loja x where x.unit_id = up.unit_id)
        and not exists (select 1 from keeta_pedidos_recentes x where x.unit_id = up.unit_id)
      else false
    end;
$$;
