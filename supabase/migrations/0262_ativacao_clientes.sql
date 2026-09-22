-- Painel de ativação numa consulta só (22/09/26).
--
-- A primeira versão montava cada cliente com ~7 consultas (marcas, lojas,
-- relatórios, conexões iFood/99/CW, pedido do iFood) — com 50 clientes em
-- teste seriam ~350 idas ao banco pra desenhar uma lista. Aqui sai tudo de
-- uma vez, e as contagens são EXISTS (não baixa linha nenhuma).
--
-- Lê auth.users pro WhatsApp e o e-mail do titular (o WhatsApp informado no
-- cadastro mora em raw_user_meta_data). Por isso SECURITY DEFINER — e por
-- isso só service_role executa.
create or replace function public.ativacao_clientes(
  p_desde timestamptz,
  p_holding uuid default null
)
returns table (
  holding_id uuid,
  empresa text,
  criado_em timestamptz,
  paid boolean,
  trial_ends_at date,
  lojas integer,
  primeira_loja text,
  tem_dado boolean,
  conectada boolean,
  ifood_espera text,
  ultimo_acesso timestamptz,
  titular_nome text,
  titular_email text,
  titular_whatsapp text
)
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select h.id, h.name, h.created_at, coalesce(h.paid, false) as paid, h.trial_ends_at
    from holdings h
    where coalesce(h.conta_interna, false) = false
      and h.encerrado_em is null
      and (p_holding is not null and h.id = p_holding
           or p_holding is null and h.created_at >= p_desde)
  ),
  u as (
    select b.holding_id, un.id, un.name, un.created_at
    from brands b join units un on un.brand_id = b.id
    where b.holding_id in (select id from h)
  ),
  acesso as (
    select a.scope_id as holding_id, a.user_id, a.role, a.created_at
    from user_unit_access a
    where a.scope_type = 'holding' and a.scope_id in (select id from h)
  ),
  titular as (
    select distinct on (holding_id) holding_id, user_id
    from acesso
    order by holding_id, (role = 'admin') desc, created_at
  )
  select
    h.id,
    h.name,
    h.created_at,
    h.paid,
    h.trial_ends_at::date,
    (select count(*) from u where u.holding_id = h.id)::int,
    (select u.name from u where u.holding_id = h.id order by u.created_at limit 1),
    exists (select 1 from platform_imports pi join u on u.id = pi.unit_id where u.holding_id = h.id),
    exists (select 1 from unit_platforms up join u on u.id = up.unit_id
             where u.holding_id = h.id and up.active and up.api_store_id is not null)
      or exists (select 1 from ninefood_store_links l join u on u.id = l.unit_id
                  where u.holding_id = h.id and l.active)
      or exists (select 1 from cardapioweb_installs c join u on u.id = c.unit_id
                  where u.holding_id = h.id and c.active),
    case
      when exists (select 1 from ifood_activation_requests r
                    where r.holding_id = h.id and r.status = 'solicitada') then 'cliente'
      when exists (select 1 from ifood_activation_requests r
                    where r.holding_id = h.id and r.status = 'pendente') then 'nossa'
    end,
    (select max(p.last_seen_at) from acesso a join profiles p on p.user_id = a.user_id
      where a.holding_id = h.id),
    coalesce(pt.full_name, au.raw_user_meta_data->>'full_name'),
    au.email::text,
    au.raw_user_meta_data->>'whatsapp'
  from h
  left join titular t on t.holding_id = h.id
  left join profiles pt on pt.user_id = t.user_id
  left join auth.users au on au.id = t.user_id
  order by h.created_at desc;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ativacao_clientes(timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.ativacao_clientes(timestamptz, uuid)
  to service_role;
