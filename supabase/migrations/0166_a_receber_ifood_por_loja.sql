-- Soma os repasses do iFood ainda NÃO recebidos, POR LOJA.
--
-- Irmã da `fluxo_caixa_repasses_ifood` (migration 0150), que agrupa por DIA
-- para desenhar o saldo corrido. Aqui a pergunta é outra: quanto cada loja tem
-- a receber, para a coluna "A receber" do comparativo e para o card da Visão
-- Geral. Agrupar por dia e re-somar em JS não serve -- o que se quer é uma
-- linha por loja, e as duas telas mostram recortes diferentes do mesmo dado.
--
-- Mesma razão da 0150 para viver no banco: em 08/08/26 havia 130.600 linhas
-- pendentes em 64 lojas. Baixar isso pra somar em JavaScript custaria 131 idas
-- ao PostgREST (que corta em 1.000 linhas) para produzir 64 números, e a
-- tabela cresce a cada importação. Aggregates do PostgREST estão desligados
-- neste projeto, então tem que ser função.
--
-- SEM data final: "a receber" é tudo que ainda vai cair, não um horizonte. O
-- Fluxo de Caixa é que tem janela (30/60/90 dias) -- e por isso os dois números
-- podem divergir de propósito, quando houver repasse previsto além da janela.
--
-- Só LEITURA: não escreve, não altera tabela.

create or replace function a_receber_ifood_por_loja(
  p_de date,
  -- null = todas as lojas. Array vazio devolve vazio (fail-closed: franqueado
  -- sem loja visível não pode enxergar a rede).
  p_unit_ids uuid[] default null
)
returns table (
  unit_id uuid,
  total numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.unit_id,
         sum(l.valor)::numeric as total
  from ifood_financeiro_lancamentos l
  where l.impacto_no_repasse = true
    and l.data_repasse_esperada >= p_de
    and l.unit_id is not null
    and (p_unit_ids is null or l.unit_id = any (p_unit_ids))
  group by 1
$function$;

-- Chamada pelo servidor com service_role. É `security definer`, então ignora
-- RLS -- o acesso fica fechado pro resto.
revoke all on function a_receber_ifood_por_loja(date, uuid[]) from public;
revoke all on function a_receber_ifood_por_loja(date, uuid[]) from anon;
revoke all on function a_receber_ifood_por_loja(date, uuid[]) from authenticated;
grant execute on function a_receber_ifood_por_loja(date, uuid[]) to service_role;

-- O índice da 0150 já cobre este filtro: (data_repasse_esperada, unit_id)
-- parcial em impacto_no_repasse. Nada novo a criar.
