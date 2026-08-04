-- Perfil da operação do Cardápio Web, agregado dentro do banco.
--
-- O Cardápio Web é o hub da própria loja, então o pedido dele carrega coisas
-- que marketplace nenhum entrega: se foi delivery, retirada, mesa ou consumo
-- no local; a hora exata; a forma de pagamento real; o motivo do cancelamento
-- em texto; e as taxas separadas do total. Tudo isso já estava no banco e
-- nenhuma tela lia.
--
-- Uma função só, devolvendo um jsonb com todos os blocos, porque as telas
-- pedem os cortes JUNTOS (a aba da unidade mostra tipo + turno + pagamento na
-- mesma dobra). Seis funções seriam seis idas ao banco para montar uma tela.
--
-- Aggregates do PostgREST estão desligados neste projeto (`Use of aggregate
-- functions is not allowed`), então tem que ser função mesmo — e o caminho
-- errado seria baixar as linhas cruas pra somar em JavaScript, que é a doença
-- conhecida deste projeto (a resposta corta em 1.000 linhas e vira laço
-- sequencial).
--
-- POR QUE canais e instalações VÊM DE FORA (p_canais, p_install_ids):
-- as duas regras de negócio -- "o que é canal próprio" e "o que é produção" --
-- moram no TypeScript (CANAIS_PROPRIOS e installIdsDeProducao). Reescrevê-las
-- aqui criaria uma segunda cópia que diverge com o tempo: foi exatamente o que
-- aconteceu com CANAIS_PROPRIOS, que existia em dois arquivos e fez o totem
-- ser canal próprio numa tela e marketplace na outra. Uma regra, um lugar.
--
-- Só LEITURA: não escreve, não altera tabela.

create or replace function cardapioweb_operacao(
  p_unit_ids uuid[],
  p_inicio timestamptz,
  p_fim timestamptz,
  -- Canais sem comissão de marketplace. Vazio = todos (a tela de conferência
  -- quer ver tudo); null é tratado como vazio.
  p_canais text[] default null,
  -- Instalações que contam pro número consolidado (só produção). Vazio = todas.
  p_install_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.*
    from cardapioweb_pedidos p
    where p.unit_id = any(p_unit_ids)
      and p.criado_em >= p_inicio
      and p.criado_em <  p_fim
      and (p_canais is null or cardinality(p_canais) = 0
           or p.sales_channel = any(p_canais))
      and (p_install_ids is null or cardinality(p_install_ids) = 0
           or p.install_id = any(p_install_ids))
  ),
  -- Válido = não cancelado. O bruto INCLUI cancelado (é a cesta que o cliente
  -- chegou a montar); o líquido, não. Mesma régua do resto do sistema.
  valido as (select * from base where status is distinct from 'canceled')
  select jsonb_build_object(
    'total', (select jsonb_build_object(
        'pedidos', count(*),
        'bruto', coalesce(sum(total), 0),
        'liquido', coalesce(sum(total) filter (where status is distinct from 'canceled'), 0),
        'cancelados', count(*) filter (where status = 'canceled')
      ) from base),

    -- Delivery / retirada / mesa / consumo no local. A grande cegueira: metade
    -- da operação de uma loja com salão não passa por entrega.
    'tipo', (select coalesce(jsonb_agg(x order by x->>'valor'), '[]'::jsonb) from (
        select jsonb_build_object(
          'valor', coalesce(order_type, 'desconhecido'),
          'pedidos', count(*),
          'valor_total', coalesce(sum(total), 0)
        ) x
        from valido group by order_type
      ) t),

    -- Hora cheia, no fuso de Brasília. `criado_em` é timestamptz; sem converter,
    -- a madrugada UTC jogaria o pico da noite pro dia seguinte.
    'hora', (select coalesce(jsonb_agg(x order by (x->>'valor')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'valor', extract(hour from criado_em at time zone 'America/Sao_Paulo')::int,
          'pedidos', count(*),
          'valor_total', coalesce(sum(total), 0)
        ) x
        from valido
        group by extract(hour from criado_em at time zone 'America/Sao_Paulo')
      ) t),

    -- 0 = domingo, igual ao getDay() do JavaScript, pra tela não ter que
    -- reordenar nada.
    'dia_semana', (select coalesce(jsonb_agg(x order by (x->>'valor')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'valor', extract(dow from criado_em at time zone 'America/Sao_Paulo')::int,
          'pedidos', count(*),
          'valor_total', coalesce(sum(total), 0)
        ) x
        from valido
        group by extract(dow from criado_em at time zone 'America/Sao_Paulo')
      ) t),

    -- Forma de pagamento REAL do pedido, com bandeira e se foi pago na hora
    -- (offline) ou antecipado (online) -- que é diferença de caixa, não de
    -- estatística.
    'pagamento', (select coalesce(jsonb_agg(x order by (x->>'valor_total')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'metodo', coalesce(pg->>'payment_method', 'desconhecido'),
          'tipo', pg->>'payment_type',
          'bandeira', pg->>'card_brand',
          'pedidos', count(*),
          'valor_total', coalesce(sum((pg->>'total')::numeric), 0),
          'taxa', coalesce(sum((pg->>'payment_fee')::numeric), 0)
        ) x
        from valido, jsonb_array_elements(coalesce(pagamentos, '[]'::jsonb)) pg
        group by pg->>'payment_method', pg->>'payment_type', pg->>'card_brand'
      ) t),

    -- Por que cancelou, em texto. Vem pronto do Cardápio Web e cada motivo
    -- aponta pra um conserto diferente ("sem entregador" != "item indisponível").
    'cancelamento', (select coalesce(jsonb_agg(x order by (x->>'pedidos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'motivo', coalesce(nullif(trim(cancellation_reason), ''), 'Sem motivo informado'),
          'pedidos', count(*),
          'valor_total', coalesce(sum(total), 0)
        ) x
        from base where status = 'canceled'
        group by coalesce(nullif(trim(cancellation_reason), ''), 'Sem motivo informado')
      ) t),

    -- Taxas que hoje ficam embutidas no total sem ninguém separar. Entrega é
    -- receita da loja; serviço (os 10%) é dinheiro do garçom e NÃO é dela.
    'taxas', (select jsonb_build_object(
        'entrega', coalesce(sum(delivery_fee), 0),
        'servico', coalesce(sum(service_fee), 0),
        'adicional', coalesce(sum(additional_fee), 0),
        'pedidos_com_entrega', count(*) filter (where coalesce(delivery_fee, 0) > 0),
        'pedidos_com_servico', count(*) filter (where coalesce(service_fee, 0) > 0)
      ) from valido)
  );
$$;

comment on function cardapioweb_operacao(uuid[], timestamptz, timestamptz, text[], uuid[]) is
  'Perfil da operação do Cardápio Web (tipo de pedido, hora, dia, pagamento, cancelamento, taxas). Só leitura.';

-- A função roda como dona e, por ser `security definer`, IGNORA RLS. O Postgres
-- concede EXECUTE a PUBLIC por padrão e o `anon` do Supabase herda isso — ou
-- seja, sem os revokes abaixo ela viraria uma rota aberta pra internet ler
-- pedido de qualquer cliente. Já aconteceu duas vezes neste projeto (migrations
-- 0083 e 0151). O acesso fica só pelo servidor, que escopa as lojas antes.
revoke all on function cardapioweb_operacao(uuid[], timestamptz, timestamptz, text[], uuid[]) from public;
revoke all on function cardapioweb_operacao(uuid[], timestamptz, timestamptz, text[], uuid[]) from anon;
revoke all on function cardapioweb_operacao(uuid[], timestamptz, timestamptz, text[], uuid[]) from authenticated;
grant execute on function cardapioweb_operacao(uuid[], timestamptz, timestamptz, text[], uuid[]) to service_role;
