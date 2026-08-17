-- Custo POR ITEM VENDIDO — a base da tela nova de Ficha Técnica.
--
-- ── POR QUE NÃO TEM CADASTRO DE PRODUTO (Marcus, 16/08/26) ───────────────
-- O desenho anterior tinha duas etapas: cadastrar o produto com o custo e
-- depois ligar cada nome vendido a esse produto. Medimos o custo dessa segunda
-- etapa na base real: 127 nomes numa loja, e normalizar o texto (tirar acento,
-- pontuação, "(Mais Pedido!)") derruba isso para 115. Ou seja, casar nome não
-- funciona — os cardápios são escritos diferente de verdade, e um de-para
-- automático erraria em silêncio, jogando custo de carne num refrigerante.
--
-- Então some a etapa: o custo é digitado NA PRÓPRIA LINHA do item vendido.
-- A mesma sobrecoxa em três plataformas vira três linhas com o custo repetido —
-- é redundante, e mesmo assim é menos trabalho do que manter um catálogo e um
-- de-para. Com ~20 linhas cobrindo ~88% da receita de cada loja, o custo dessa
-- redundância é pequeno e o da abstração era o projeto inteiro.
--
-- ⚠️ A CHAVE É (loja, plataforma, nome). Não é global: "Sobrecoxa Desossada
-- Defumada" custa uma coisa no Brooklin e outra em Osasco, e é assim que tem
-- que ser — a ficha é por loja.
create table if not exists public.item_custos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  platform text not null check (platform in ('ifood','99food','keeta','cardapioweb')),
  nome_item text not null,

  -- Custo de UMA unidade vendida. Zero é um valor legítimo (item de cortesia),
  -- então "não preenchido" é a AUSÊNCIA da linha, não o zero.
  custo numeric not null default 0,
  observacao text,

  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (unit_id, platform, nome_item)
);

create index if not exists item_custos_unit_idx on public.item_custos (unit_id);

comment on table public.item_custos is
  'Custo por unidade vendida, digitado direto na linha do item. Chave (loja, plataforma, nome) — sem catálogo de produto e sem de-para: casar nome entre plataformas erra em silêncio.';

alter table public.item_custos enable row level security;

drop policy if exists item_custos_select on public.item_custos;
create policy item_custos_select on public.item_custos for select
  using (public.has_unit_access(unit_id));
-- Escrita só via service_role, atrás da server action que checa permissão.

-- ── Vendas por item, agregadas NO BANCO ─────────────────────────────────────
--
-- ⚠️ AGREGA AQUI E NÃO EM JS DE PROPÓSITO. O caminho antigo baixava linha crua
-- e somava no servidor: são 55 mil linhas só de Keeta, e o `fetchAllRows` que
-- fazia isso é justamente o que mostra número pela metade quando a paginação
-- estoura, sem avisar ninguém. Uma loja num mês cabe numa consulta.
--
-- Cada plataforma entrega a receita de um jeito diferente e isso é normalizado
-- aqui, num lugar só:
--   iFood  — valor_total por dia
--   99     — receita por dia
--   Keeta  — NÃO tem valor: só preço médio. Receita = qtd × preço médio.
--   CW     — preço total por item do pedido, ignorando pedido cancelado
create or replace function public.itens_vendidos_mes(
  p_unit_id uuid,
  p_year int,
  p_month int
)
returns table (
  platform text,
  nome_item text,
  qtd numeric,
  receita numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select 'ifood'::text as platform, i.nome_item,
           sum(coalesce(i.qtd_vendida,0))::numeric as qtd,
           sum(coalesce(i.valor_total,0))::numeric as receita
    from public.ifood_daily_items i
    where i.unit_id = p_unit_id
      and extract(year from i.date) = p_year
      and extract(month from i.date) = p_month
      and i.nome_item is not null
    group by i.nome_item

    union all

    select '99food', n.nome_item,
           sum(coalesce(n.qtd_vendida,0))::numeric,
           sum(coalesce(n.receita,0))::numeric
    from public.ninefood_daily_item n
    where n.unit_id = p_unit_id
      and extract(year from n.data) = p_year
      and extract(month from n.data) = p_month
      and n.nome_item is not null
    group by n.nome_item

    union all

    -- Keeta não manda o valor da linha, só o preço médio do dia. Multiplicar é
    -- a única receita disponível — e é aproximação, não o extrato.
    select 'keeta', k.nome_item,
           sum(coalesce(k.qtd_vendida,0))::numeric,
           sum(coalesce(k.qtd_vendida,0) * coalesce(k.preco_medio,0))::numeric
    from public.keeta_daily_item k
    where k.unit_id = p_unit_id
      and k.ref_year = p_year
      and k.ref_month = p_month
      and k.nome_item is not null
    group by k.nome_item

    union all

    select 'cardapioweb', ci.nome,
           sum(coalesce(ci.quantidade,0))::numeric,
           sum(coalesce(ci.preco_total,0))::numeric
    from public.cardapioweb_pedido_itens ci
    join public.cardapioweb_pedidos p on p.id = ci.pedido_id
    where ci.unit_id = p_unit_id
      and p.ref_year = p_year
      and p.ref_month = p_month
      and p.status <> 'canceled'
      and ci.nome is not null
    group by ci.nome
  )
  select platform, nome_item, qtd, receita
  from base
  where qtd > 0
  order by receita desc nulls last;
$$;

-- ⚠️ SECURITY DEFINER + REVOKE. A função lê venda de QUALQUER loja pelo id —
-- exposta ao papel `authenticated` viraria leitura cross-tenant por uuid. Só o
-- service_role chama, atrás do guard da tela. (Este furo já apareceu duas vezes
-- neste banco, migrations 0083 e 0151. Aqui não se repete.)
revoke all on function public.itens_vendidos_mes(uuid, int, int) from public, anon, authenticated;
grant execute on function public.itens_vendidos_mes(uuid, int, int) to service_role;

-- ── Comissão da Keeta no mês ────────────────────────────────────────────────
--
-- ⚠️ POR QUE UMA FUNÇÃO SÓ PRA SOMAR UMA COLUNA: os aggregates do PostgREST
-- estão desligados neste projeto, então `select("comissao.sum()")` não existe
-- como caminho. A alternativa seria baixar os 1.747 pedidos do mês pra somar em
-- JS — que é exatamente a doença que este arquivo evita no `itens_vendidos_mes`.
--
-- Só a Keeta precisa disto: iFood e 99 Food já expõem a comissão nos seus
-- agregadores (`comissaoIfood`, `comissaoRs`), e o Cardápio Web é canal próprio
-- e não tem comissão.
create or replace function public.keeta_comissao_mes(
  p_unit_id uuid,
  p_year int,
  p_month int
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(comissao), 0)::numeric
  from public.keeta_pedidos
  where unit_id = p_unit_id
    and ref_year = p_year
    and ref_month = p_month;
$$;

revoke all on function public.keeta_comissao_mes(uuid, int, int) from public, anon, authenticated;
grant execute on function public.keeta_comissao_mes(uuid, int, int) to service_role;
