/*
 * Semana × plataforma: faturamento, pedidos e nota, numa chamada só.
 *
 * ── POR QUE FUNÇÃO NO BANCO, E NÃO QUERIES NO TS ──────────────────────────
 * A aba mostra 8 semanas e cada semana abre em 4 plataformas. Montado em
 * TypeScript isso vira 32 idas ao banco pra desenhar UMA tela — e a nota de
 * performance deste projeto existe justamente por causa desse padrão (baixar
 * linha crua pra somar em JS). Aqui é 1 chamada, e o Postgres agrupa.
 *
 * ── A SEMANA É A MESMA DO CICLO ───────────────────────────────────────────
 * `date_trunc('week')` do Postgres começa na SEGUNDA (ISO), que é exatamente
 * a convenção do relatorio_semanal. Não é coincidência feliz: se divergisse,
 * a linha da semana e o detalhe dela falariam de períodos diferentes.
 *
 * ── A NOTA MORA EM QUATRO LUGARES DIFERENTES ──────────────────────────────
 * iFood tem tabela própria de avaliação; 99 e Keeta guardam a nota NO PEDIDO;
 * Cardápio Web tem tabela sem data de pedido, só `criado_em`. Uniformizar
 * isso aqui é o ponto da função — a tela não deveria saber dessas diferenças.
 *
 * ⚠️ A nota é agrupada pela DATA DA AVALIAÇÃO, não pela do pedido. O cliente
 * avalia dias depois; contar pela venda jogaria a nota na semana errada e a
 * semana recém-fechada pareceria sempre pior do que é.
 */

create or replace function public.semana_por_plataforma(
  p_unit_id uuid,
  p_de      date,
  p_ate     date
)
returns table (
  semana      date,
  plataforma  text,
  pedidos     bigint,
  bruto       numeric,
  nota_media  numeric,
  notas_qtd   bigint
)
language sql
stable
set search_path = public
as $$
  with vendas as (
    select date_trunc('week', p.data)::date s, 'ifood'::text plat,
           count(*)::bigint ped, coalesce(sum(p.total_pago_cliente),0)::numeric val
      from ifood_pedidos p
     where p.unit_id = p_unit_id and p.data between p_de and p_ate
     group by 1
    union all
    select date_trunc('week', p.data)::date, '99food',
           count(*)::bigint, coalesce(sum(p.receita_vendas),0)::numeric
      from ninefood_pedidos p
     where p.unit_id = p_unit_id and p.data between p_de and p_ate
     group by 1
    union all
    select date_trunc('week', p.data)::date, 'keeta',
           count(*)::bigint, coalesce(sum(p.vendas_itens),0)::numeric
      from keeta_pedidos p
     where p.unit_id = p_unit_id and p.data between p_de and p_ate
     group by 1
    union all
    select date_trunc('week', (p.criado_em at time zone 'America/Sao_Paulo'))::date,
           'cardapioweb',
           count(*)::bigint, coalesce(sum(p.total),0)::numeric
      from cardapioweb_pedidos p
     where p.unit_id = p_unit_id
       and (p.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     group by 1
  ),
  notas as (
    select date_trunc('week', a.data_avaliacao)::date s, 'ifood'::text plat,
           avg(a.nota)::numeric m, count(*)::bigint q
      from ifood_avaliacoes a
     where a.unit_id = p_unit_id and a.data_avaliacao between p_de and p_ate
       and a.nota is not null
     group by 1
    union all
    select date_trunc('week', p.data_avaliacao)::date, '99food',
           avg(p.nivel_avaliacao)::numeric, count(*)::bigint
      from ninefood_pedidos p
     where p.unit_id = p_unit_id and p.data_avaliacao between p_de and p_ate
       and p.nivel_avaliacao is not null
     group by 1
    union all
    select date_trunc('week', p.data_avaliacao)::date, 'keeta',
           avg(p.pontuacao_avaliacao)::numeric, count(*)::bigint
      from keeta_pedidos p
     where p.unit_id = p_unit_id and p.data_avaliacao between p_de and p_ate
       and p.pontuacao_avaliacao is not null
     group by 1
    union all
    select date_trunc('week', (a.criado_em at time zone 'America/Sao_Paulo'))::date,
           'cardapioweb',
           avg(a.nota)::numeric, count(*)::bigint
      from cardapioweb_avaliacoes a
     where a.unit_id = p_unit_id and a.nota is not null
       and (a.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
     group by 1
  )
  /* FULL JOIN: semana pode ter venda sem nota (ninguém avaliou ainda) e nota
     sem venda (avaliação chegando depois do recorte). Um INNER esconderia as
     duas — e esconder é o defeito que este projeto mais repetiu. */
  select coalesce(v.s, n.s), coalesce(v.plat, n.plat),
         coalesce(v.ped, 0), coalesce(v.val, 0), n.m, coalesce(n.q, 0)
    from vendas v
    full join notas n on n.s = v.s and n.plat = v.plat
   order by 1 desc, 2;
$$;

comment on function public.semana_por_plataforma is
  'Faturamento, pedidos e nota por semana e plataforma de uma loja. Semana ISO '
  '(segunda), igual ao relatorio_semanal. Nota agrupada pela data da AVALIACAO, '
  'nao do pedido.';

revoke execute on function public.semana_por_plataforma(uuid, date, date)
  from public, anon, authenticated;
