-- Queda de vendas medida contra a propria loja, plataforma a plataforma.
--
-- ── POR QUE (Marcus, 22/08/26) ───────────────────────────────────────────
-- O sistema sabia dizer "o dado chegou" e nunca "a venda caiu". O gestor so
-- descobria fechando o mes -- quando ja nao dava pra fazer nada sobre ele.
--
-- ── DUAS PERGUNTAS DIFERENTES, DOIS LIMIARES ─────────────────────────────
--  • COMPARAR exige dado dos ultimos 7 dias. Plataforma com mais de 3 dias de
--    buraco invalida a janela recente, seja essa a cadencia normal dela ou
--    nao. Limiar tecnico, sem folga -- e o que decide o estado.
--  • ALERTAR depende da CADENCIA de cada plataforma e NAO se decide aqui: a
--    funcao devolve a defasagem em dias e quem avisa e que julga. Keeta entra
--    por planilha semanal (5 dias e rotina); iFood e diario (5 dias e
--    problema). Um limiar so produziria 23 lojas em alerta permanente, e
--    alerta permanente ninguem le. Ver CADENCIA_DIAS em lib/data/alertas-venda.
--
-- ── AS TRES ARMADILHAS JA PISADAS ────────────────────────────────────────
-- Todas a mesma: confundir "o dado nao chegou" com "a loja nao vendeu".
--  1. Ancora no CALENDARIO: loja com importacao atrasada parecia loja fechada.
--  2. Ancora por LOJA: a Fiorentina "caiu 89,9%" porque a 99 dela parou em
--     07/08 -- 380 pedidos na base e zero na janela recente.
--  3. Fonte INCOMPLETA: a 99 tem planilha E API. Olhando so a planilha, oito
--     lojas do Churrasco no Pote apareciam paradas com a API em dia.
--
-- Duas escolhas de metodo que sustentam o resto:
--  • Janela de 7 dias contra a media semanal das 4 anteriores. Sete dias
--    consecutivos contem cada dia da semana exatamente uma vez dos dois lados
--    da conta -- dispensa mediana por dia da semana.
--  • Piso de volume antes de falar em porcentagem: loja que faz 3 pedidos por
--    semana nao tem "queda de 50%", tem dois pedidos a menos.
create or replace function public.alertas_venda(
  p_piso_semanal integer default 7,
  p_queda_pct numeric default 40
)
returns table (
  unit_id uuid,
  ancora date,
  pedidos_recentes bigint,
  pedidos_base numeric,
  queda_pct numeric,
  estado text,
  -- [{"plat":"99 Food","dias":12,"peso":0.41}] — peso e a fatia do movimento
  -- da loja que aquela plataforma representava.
  defasadas jsonb
)
language sql
security definer
set search_path = public
as $$
  with nine as (
    -- Planilha e API no mesmo dia: fica a MAIOR das duas, nunca a soma --
    -- somar dobraria o pedido que veio pelos dois caminhos.
    select coalesce(p.unit_id, a.unit_id) as unit_id,
           coalesce(p.dia, a.dia) as dia,
           greatest(coalesce(p.qtd, 0), coalesce(a.qtd, 0)) as qtd
      from (
        select n.unit_id, n.data::date as dia, coalesce(sum(n.pedidos), 0)::bigint as qtd
          from public.ninefood_daily_loja n
         where n.data >= current_date - 70 group by 1, 2
      ) p
      full join (
        select sl.unit_id, b.business_date::date as dia, count(*)::bigint as qtd
          from public.ninefood_api_bill b
          join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
         where b.business_date >= current_date - 70 and sl.unit_id is not null
         group by 1, 2
      ) a on a.unit_id = p.unit_id and a.dia = p.dia
  ),
  dia_plat as (
    select p.unit_id, 'iFood' as plat, p.data::date as dia, count(*)::bigint as qtd
      from public.ifood_pedidos p where p.data >= current_date - 70 group by 1,2,3
    union all
    select n.unit_id, '99 Food', n.dia, n.qtd from nine n
    union all
    select k.unit_id, 'Keeta', k.data::date, coalesce(sum(k.total_pedidos),0)::bigint
      from public.keeta_daily_loja k where k.data >= current_date - 70 group by 1,2,3
    union all
    select c.unit_id, 'Cardapio Web', c.criado_em::date, count(*)::bigint
      from public.cardapioweb_pedidos c
     where c.unit_id is not null and c.criado_em >= current_date - 70 group by 1,2,3
  ),
  ancora_loja as (
    select unit_id, max(dia) as ancora from dia_plat group by unit_id
  ),
  classificacao as (
    select ap.unit_id, ap.plat, al.ancora,
           (al.ancora - ap.ultimo_plat) as dias_atras,
           (al.ancora - ap.ultimo_plat) > 3 as defasada
      from (
        select unit_id, plat, max(dia) as ultimo_plat from dia_plat group by 1, 2
      ) ap
      join ancora_loja al on al.unit_id = ap.unit_id
  ),
  por_plat as (
    select c.unit_id, c.ancora, c.plat, c.defasada, c.dias_atras,
           coalesce(sum(d.qtd) filter (
             where d.dia > c.ancora - 7 and d.dia <= c.ancora
           ), 0) as recentes,
           coalesce(sum(d.qtd) filter (
             where d.dia > c.ancora - 35 and d.dia <= c.ancora - 7
           ), 0) / 4.0 as base
      from classificacao c
      join dia_plat d on d.unit_id = c.unit_id and d.plat = c.plat
     group by c.unit_id, c.ancora, c.plat, c.defasada, c.dias_atras
  ),
  com_peso as (
    select p.*, sum(p.base) over (partition by p.unit_id) as base_total_loja
      from por_plat p
  ),
  somas as (
    select p.unit_id, p.ancora,
           coalesce(sum(p.recentes) filter (where not p.defasada), 0)::bigint as recentes,
           round(coalesce(sum(p.base) filter (where not p.defasada), 0), 1) as base,
           coalesce(sum(p.base) filter (where p.defasada), 0) as base_defasada,
           max(p.base_total_loja) as base_total,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'plat', p.plat,
                 'dias', p.dias_atras,
                 'peso', round((p.base / nullif(p.base_total_loja, 0))::numeric, 3)
               )
             ) filter (where p.defasada),
             '[]'::jsonb
           ) as defasadas
      from com_peso p
     group by p.unit_id, p.ancora
  )
  select s.unit_id,
         s.ancora,
         s.recentes as pedidos_recentes,
         s.base as pedidos_base,
         case when s.base > 0
              then round((s.base - s.recentes) * 100 / s.base, 1)
              else 0 end as queda_pct,
         case
           -- Plataforma parada que valia mais de um quinto do movimento tira o
           -- direito de opinar sobre venda: o buraco pode ser so do dado.
           when s.base_defasada > greatest(s.base_total, 1) * 0.2 then 'dado-incompleto'
           when s.base < p_piso_semanal then 'baixo-volume'
           when s.recentes = 0 then 'parou'
           when (s.base - s.recentes) * 100 / s.base >= p_queda_pct then 'caiu'
           else 'ok'
         end as estado,
         s.defasadas
    from somas s
   where s.base > 0 or s.recentes > 0 or s.base_defasada > 0;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public`.
--
-- O grant padrao de EXECUTE em funcao e pro papel PUBLIC, e o anon HERDA dele:
-- revogar so de anon e authenticated deixa a porta aberta pelo papel generico.
-- Foi exatamente o que aconteceu na primeira versao desta migration, em
-- 22/08/26, e o gate do CI barrou antes de virar exposicao. TERCEIRO caso deste
-- mesmo P0 no repositorio -- ver 0083 e 0151.
revoke execute on function public.alertas_venda(integer, numeric)
  from public, anon, authenticated;
grant execute on function public.alertas_venda(integer, numeric) to service_role;

comment on function public.alertas_venda is
  'Queda de vendas de cada loja contra ela mesma: 7 dias recentes vs media semanal das 4 semanas anteriores, ancorado por PLATAFORMA no ultimo dia com dado dela.';
