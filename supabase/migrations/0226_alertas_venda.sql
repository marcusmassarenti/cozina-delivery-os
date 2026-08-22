-- Queda de vendas medida contra a PRÓPRIA loja — não contra um limiar fixo.
--
-- ── POR QUE (Marcus, 22/08/26) ───────────────────────────────────────────
-- O sistema sabia dizer "o dado chegou", nunca "a venda caiu". E o indicador
-- que a gente usava pra saúde — a data do último lançamento — é péssimo pra
-- loja de baixo volume: na Ki Delicia, com 1 a 3 pedidos por dia, um único
-- pedido que o iFood liquide mais devagar move a data em três dias sem que
-- nada tenha acontecido.
--
-- ── AS DUAS DECISÕES QUE FAZEM ISSO FUNCIONAR ────────────────────────────
--
-- 1. JANELA DE 7 DIAS CONTRA AS 4 SEMANAS ANTERIORES.
--    Sete dias consecutivos contêm cada dia da semana exatamente uma vez, dos
--    dois lados da conta. Isso dispensa mediana por dia da semana e mata de
--    graça o viés de "segunda não é sábado" — comparar 7 dias com 7 dias
--    equivalentes é comparar como com como.
--
-- 2. PISO DE VOLUME ANTES DE FALAR EM PORCENTAGEM.
--    Loja que faz 3 pedidos por semana não tem "queda de 50%": tem dois
--    pedidos a menos. Abaixo do piso a loja sai da apuração — o silêncio dela
--    é sobre o negócio, e virar alarme semanal seria repetir o erro que a
--    gente acabou de consertar no relatório de saúde.
--
-- Os pedidos vêm das quatro plataformas somados: o que interessa ao gestor é a
-- loja, não o canal. Qual canal caiu é a próxima pergunta, não a primeira.
create or replace function public.alertas_venda(
  p_piso_semanal integer default 7,
  p_queda_pct numeric default 40
)
returns table (
  unit_id uuid,
  pedidos_recentes bigint,
  pedidos_base numeric,
  queda_pct numeric,
  estado text
)
language sql
security definer
set search_path = public
as $$
  with dias as (
    -- Últimos 7 dias fechados (ontem para trás) e as 4 semanas anteriores.
    select current_date - 7 as ini_recente,
           current_date - 1 as fim_recente,
           current_date - 35 as ini_base,
           current_date - 8  as fim_base
  ),
  pedidos as (
    select p.unit_id, p.data::date as dia, count(*)::bigint as qtd
      from public.ifood_pedidos p, dias d
     where p.data >= d.ini_base and p.data <= d.fim_recente
     group by 1, 2
    union all
    select n.unit_id, n.data::date, coalesce(sum(n.pedidos), 0)::bigint
      from public.ninefood_daily_loja n, dias d
     where n.data >= d.ini_base and n.data <= d.fim_recente
     group by 1, 2
    union all
    select k.unit_id, k.data::date, coalesce(sum(k.total_pedidos), 0)::bigint
      from public.keeta_daily_loja k, dias d
     where k.data >= d.ini_base and k.data <= d.fim_recente
     group by 1, 2
    union all
    select c.unit_id, c.criado_em::date, count(*)::bigint
      from public.cardapioweb_pedidos c, dias d
     where c.unit_id is not null
       and c.criado_em >= d.ini_base and c.criado_em < d.fim_recente + 1
     group by 1, 2
  ),
  somas as (
    select p.unit_id,
           sum(p.qtd) filter (where p.dia >= d.ini_recente) as recentes,
           -- Média semanal das 4 semanas anteriores: mesma unidade de medida
           -- dos 7 dias recentes, sem precisar casar dia a dia.
           round(coalesce(sum(p.qtd) filter (where p.dia <= d.fim_base), 0) / 4.0, 1) as base
      from pedidos p, dias d
     group by p.unit_id
  )
  select s.unit_id,
         coalesce(s.recentes, 0) as pedidos_recentes,
         s.base as pedidos_base,
         case when s.base > 0
              then round((s.base - coalesce(s.recentes, 0)) * 100 / s.base, 1)
              else 0 end as queda_pct,
         case
           when s.base < p_piso_semanal then 'baixo-volume'
           when coalesce(s.recentes, 0) = 0 then 'parou'
           when (s.base - s.recentes) * 100 / s.base >= p_queda_pct then 'caiu'
           else 'ok'
         end as estado
    from somas s
   where s.base > 0 or s.recentes > 0;
$$;

revoke all on function public.alertas_venda(integer, numeric) from anon, authenticated;

comment on function public.alertas_venda is
  'Queda de vendas de cada loja contra ela mesma: 7 dias recentes vs a media semanal das 4 semanas anteriores. Piso de volume evita porcentagem em loja que faz poucos pedidos.';
