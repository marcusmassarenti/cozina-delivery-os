-- "Quando esta loja vendeu pela última vez?" — para as 50 lojas da página.
--
-- ── POR QUE UMA FUNÇÃO, E POR QUE LATERAL ────────────────────────────────
-- A tela de Unidades vai paginar (50 por página) e mostrar a última venda de
-- cada loja. A resposta cruza QUATRO tabelas de pedidos, e o jeito óbvio é o
-- caro. Medido neste banco, para 50 lojas:
--
--   select unit_id, max(data) ... group by unit_id   →  367 ms   (133 mil linhas lidas)
--   left join lateral (... order by data desc limit 1) →  0,7 ms  (50 seeks no índice)
--
-- 500× de diferença, e a razão é simples: `max()` sobre o índice ainda percorre
-- TODA a faixa daquela loja, enquanto o lateral com `limit 1` lê uma linha e
-- para. Com 500 lojas e uma tela que abre o dia inteiro, isso é a diferença
-- entre a página responder na hora e responder em segundos.
--
-- ⚠️ NÃO trocar por `saude_lojas()`, que já responde algo parecido: ela roda
-- em 788 ms para 98 lojas (~4 s projetados para 500) porque calcula sinal de
-- TODAS as lojas e de todas as plataformas. É a função certa pro relatório
-- diário, e a errada pra uma tela.
--
-- Recebe os ids da PÁGINA, não da rede inteira: o custo tem que ser
-- proporcional ao que está na tela, senão o cliente de 500 lojas paga pelas
-- 450 que ele não está olhando.
create or replace function public.unidades_resumo_lista(p_unit_ids uuid[])
returns table(unit_id uuid, ultima_venda date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id,
         -- greatest() ignora NULL quando há pelo menos um valor, que é o que
         -- queremos: loja com iFood e sem Keeta tem a data do iFood, não NULL.
         greatest(i.d, n.d, k.d, c.d) as ultima_venda
  from unnest(p_unit_ids) as u(id)
  left join lateral (
    select p.data as d from ifood_pedidos p
    where p.unit_id = u.id order by p.data desc limit 1
  ) i on true
  left join lateral (
    select p.data as d from ninefood_pedidos p
    where p.unit_id = u.id order by p.data desc limit 1
  ) n on true
  left join lateral (
    select p.data as d from keeta_pedidos p
    where p.unit_id = u.id order by p.data desc limit 1
  ) k on true
  left join lateral (
    select p.criado_em::date as d from cardapioweb_pedidos p
    where p.unit_id = u.id order by p.criado_em desc limit 1
  ) c on true
$function$;

-- ⚠️ A reincidência de RPC aberta ao anônimo neste projeto (jul e ago/26)
-- custou dois P0. Esta função é `security definer` e responde por QUALQUER
-- unidade cujo id chegue no array — o escopo por usuário é feito em
-- `getUnitsPage`, antes de chamar. Fechar aqui é o que garante que não dá pra
-- pular essa etapa pelo PostgREST.
revoke execute on function public.unidades_resumo_lista(uuid[])
  from public, anon, authenticated;
grant execute on function public.unidades_resumo_lista(uuid[]) to service_role;

-- O Cardápio Web era o único dos quatro sem índice que sirva ao lateral: tinha
-- (unit_id, ref_year, ref_month) e (unit_id, sales_channel), nenhum ordenável
-- por data. Sem isto, o `order by criado_em desc limit 1` viraria varredura da
-- loja inteira — hoje passa despercebido porque só há uma instalação, e
-- passaria a doer exatamente quando o Cardápio Web crescer.
create index if not exists cardapioweb_pedidos_unit_criado_idx
  on public.cardapioweb_pedidos (unit_id, criado_em desc);
