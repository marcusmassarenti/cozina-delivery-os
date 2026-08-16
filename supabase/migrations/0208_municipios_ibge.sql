-- Cidade com grafia PADRÃO — a lista oficial do IBGE dentro do banco.
--
-- ── O PROBLEMA (Marcus, 16/08/26) ────────────────────────────────────────
-- "Cidade deveria ser padrão de texto. algumas tem ~, outras em caps lock."
-- Estava certo. Medido nas 101 unidades: 45 cidades distintas, sendo que
-- várias eram a MESMA cidade escrita de jeitos diferentes —
--
--   "SAO PAULO" (4) e "São Paulo" (15)
--   "Presidente Prudente" (25) e "PRESIDENTE PRUDENTE" (3)
--   "Campinas" (2) e "CAMPINAS" (3)
--   "Goiania" (1) e "Goiânia" (1)
--   "Osasco" (2) e "OSASCO" (1)
--   "Belo Horizonte" (1) e "BELO HORIZONTE" (1)
--
-- Isso não é só feio: o seletor "Todas as cidades" listava a mesma cidade duas
-- vezes, e filtrar por uma escondia as lojas da outra. Um filtro que mente é
-- pior que filtro nenhum.
--
-- A origem é a consulta de CNPJ na Receita, que devolve tudo em caixa alta e
-- sem acento — quem cadastrou pelo formulário digitou do jeito humano, e as
-- duas grafias foram parar na mesma coluna.
--
-- ── POR QUE UMA TABELA E NÃO UM "capitalize()" ───────────────────────────
-- Título automático não sabe português: "SAO JOSE DOS CAMPOS" viraria "Sao
-- Jose Dos Campos" — sem acento e com o "Dos" maiúsculo, que é errado. A
-- grafia certa não é derivável do texto, tem que vir de uma lista.
--
-- São 5.571 municípios (~200 KB). O custo é irrisório perto de ter a resposta
-- offline, no mesmo lugar onde o dado é gravado.
create table if not exists public.municipios_ibge (
  uf         text not null,
  -- Chave de busca: minúsculo, sem acento, espaços colapsados. É por ela que
  -- "SAO PAULO", "sao paulo" e "São Paulo" caem todos no mesmo lugar.
  chave      text not null,
  nome       text not null,
  primary key (uf, chave)
);

comment on table public.municipios_ibge is
  'Municípios do IBGE (servicodados.ibge.gov.br). Serve pra padronizar units.city na gravação.';

-- Leitura pública dentro do app (é dado aberto do IBGE, não tem nada de
-- cliente aqui), escrita só pelo service_role.
alter table public.municipios_ibge enable row level security;
drop policy if exists municipios_leitura on public.municipios_ibge;
create policy municipios_leitura on public.municipios_ibge
  for select to authenticated using (true);

-- unaccent pra a CHAVE ser calculada no banco também — senão só o TypeScript
-- saberia normalizar, e uma gravação por SQL passaria batida.
create extension if not exists unaccent;

/**
 * Nome oficial da cidade, ou o texto original quando não reconhece.
 *
 * ⚠️ NUNCA devolve NULL nem vazio: cidade que o IBGE não conhece continua como
 * foi digitada. É o caso de bairro cadastrado como cidade ("Alphaville" é
 * Barueri, "Icaraí" é Niterói) e de UF errada ("BELO HORIZONTE" com UF SP).
 * Apagar o que a pessoa escreveu porque não bate com a lista seria trocar um
 * dado feio por nenhum dado.
 */
create or replace function public.normalizar_cidade(p_cidade text, p_uf text)
returns text
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select coalesce(
    (select m.nome from municipios_ibge m
      where m.uf = upper(trim(coalesce(p_uf, '')))
        and m.chave = regexp_replace(
              lower(unaccent(trim(coalesce(p_cidade, '')))), '\s+', ' ', 'g')
      limit 1),
    p_cidade
  )
$function$;

grant execute on function public.normalizar_cidade(text, text) to authenticated, service_role;
