-- E-mail "conectado — olha o que já entrou": carimbo de enviado + resumo.
--
-- Serve as TRÊS plataformas (iFood, 99 Food, Cardápio Web): a pergunta do
-- cliente é a mesma em todas — "funcionou? o que veio?" — e o que muda é só a
-- lista de números.

-- Uma vez por (loja, plataforma): uma loja pode conectar iFood hoje e 99 Food
-- mês que vem, e cada conexão merece o seu e-mail. Null = ainda não avisei.
alter table public.unit_platforms
  add column if not exists email_conectado_at timestamptz;

comment on column public.unit_platforms.email_conectado_at is
  'Quando o e-mail de "conectado, veja o primeiro resultado" foi enviado. Null = nunca. Uma vez por loja × plataforma.';

-- Quem JÁ tem dado não recebe retroativo: a estreia da funcionalidade não pode
-- disparar "acabou de conectar!" pra quem conectou semana passada.
update public.unit_platforms up
set email_conectado_at = now()
where up.email_conectado_at is null
  and up.api_store_id is not null;

-- Total e período do financeiro do iFood de UMA loja, somado no banco.
-- Mesma razão das irmãs (0150, 0166): ifood_financeiro_lancamentos tem 831 mil
-- linhas e o PostgREST corta em 1.000 — baixar pra somar em JS custaria
-- centenas de idas ao banco pra produzir três números. Só LEITURA.
create or replace function resumo_conexao_ifood_financeiro(p_unit_id uuid)
returns table (total numeric, de date, ate date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(l.valor), 0)::numeric as total,
         min(l.data_fato_gerador)::date as de,
         max(l.data_fato_gerador)::date as ate
  from ifood_financeiro_lancamentos l
  where l.unit_id = p_unit_id
    and l.impacto_no_repasse = true
$function$;

revoke all on function resumo_conexao_ifood_financeiro(uuid) from public;
revoke all on function resumo_conexao_ifood_financeiro(uuid) from anon;
revoke all on function resumo_conexao_ifood_financeiro(uuid) from authenticated;
grant execute on function resumo_conexao_ifood_financeiro(uuid) to service_role;
