-- Quais destas lojas JÁ têm algum lançamento do iFood.
--
-- Existe porque a pergunta "tem dado?" não cabe no PostgREST sem truncar. A
-- primeira versão fazia `select unit_id ... in (lista) limit 2000` e montava um
-- Set em memória — mas 2.000 linhas da DG FOODS (651.809 no total) cobriam DUAS
-- lojas, então as outras 45 apareciam como "sem dado" e o dashboard dela abria
-- com "Buscando os dados de 45 lojas no iFood…" pra lojas que sincronizam há
-- meses. Truncagem silenciosa, a mesma classe de bug que já mordeu o fluxo de
-- caixa e o relatório de saúde aqui.
--
-- `distinct` resolve no banco: uma ida, resposta exata, tamanho da resposta
-- limitado pelo número de LOJAS e não pelo de lançamentos.
--
-- STABLE + search_path fixo: função de leitura, sem efeito colateral.
create or replace function public.unidades_com_dado_ifood(p_unit_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.unit_id
  from public.ifood_financeiro_lancamentos l
  where l.unit_id = any(p_unit_ids)
$$;

comment on function public.unidades_com_dado_ifood(uuid[]) is
  'IDs, dentre os passados, que já têm lançamento do iFood. Responde "o dado '
  'chegou?" sem trazer as linhas — usada pra separar loja conectada-e-esperando '
  'de loja conectada-e-recebendo.';

-- Função nova em `public` é exposta pelo PostgREST por padrão. Só o servidor
-- (service_role) chama esta — revogar de `public` sozinho NÃO basta.
revoke all on function public.unidades_com_dado_ifood(uuid[])
  from public, anon, authenticated;
