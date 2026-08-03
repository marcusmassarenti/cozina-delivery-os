-- Soma os repasses previstos do iFood POR DIA, dentro do banco.
--
-- Antes, o Fluxo de Caixa baixava as linhas cruas e somava em JavaScript. Como
-- o PostgREST corta a resposta em 1.000 linhas, isso virava um laço sequencial
-- de `range(from, to)`: em 03/08/26 o horizonte de 30 dias tinha 126.761 linhas
-- e exigia 127 idas ao banco -- para produzir 5 números (o período só tem 5
-- dias distintos de repasse). A tela ficava no esqueleto de carregamento tempo
-- suficiente pra parecer quebrada.
--
-- A tabela tem 779 mil linhas e 418 MB, então isso não melhora sozinho: piora
-- a cada importação. Agregar aqui devolve uma linha por dia.
--
-- Aggregates do PostgREST estão desligados neste projeto (`Use of aggregate
-- functions is not allowed`), então tem que ser função mesmo.
--
-- Só LEITURA: não escreve, não altera tabela.

create or replace function fluxo_caixa_repasses_ifood(
  p_inicio date,
  p_fim date,
  -- null = todas as lojas. Array vazio devolve vazio (fail-closed: franqueado
  -- sem loja visível não pode enxergar a rede).
  p_unit_ids uuid[] default null
)
returns table (
  dia date,
  total numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.data_repasse_esperada::date as dia,
         sum(l.valor)::numeric as total
  from ifood_financeiro_lancamentos l
  where l.impacto_no_repasse = true
    and l.data_repasse_esperada >= p_inicio
    and l.data_repasse_esperada <= p_fim
    and (p_unit_ids is null or l.unit_id = any (p_unit_ids))
  group by 1
  order by 1
$function$;

-- A função é chamada pelo servidor com service_role. Ninguém mais precisa
-- dela, e como é `security definer` ela ignora RLS -- então o acesso fica
-- fechado pro resto.
revoke all on function fluxo_caixa_repasses_ifood(date, date, uuid[]) from public;
revoke all on function fluxo_caixa_repasses_ifood(date, date, uuid[]) from anon;
revoke all on function fluxo_caixa_repasses_ifood(date, date, uuid[]) from authenticated;
grant execute on function fluxo_caixa_repasses_ifood(date, date, uuid[]) to service_role;

-- O filtro da função é (impacto_no_repasse, data_repasse_esperada). Sem índice
-- composto, some 126 mil linhas ainda custa varredura.
create index if not exists ifood_fin_lanc_repasse_previsto_idx
  on ifood_financeiro_lancamentos (data_repasse_esperada, unit_id)
  where impacto_no_repasse = true;
