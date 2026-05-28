--------------------------------------------------------------------
-- 0008_complementos_uniq_fix.sql
-- Fix: o iFood permite o MESMO nome de complemento em classificações
-- diferentes (ex.: "Arroz com Brócolis" como Obrigatório E Opcional).
-- A constraint UNIQUE original ignorava classificacao, então o segundo
-- INSERT batia em duplicidade.
--
-- Substitui a constraint por um índice UNIQUE expression que inclui
-- coalesce(classificacao, '') — tratando NULL como string vazia pra
-- preservar a unicidade mesmo quando o iFood não classifica.
--------------------------------------------------------------------

-- Apaga a UNIQUE antiga (foi criada implicitamente pela coluna UNIQUE)
alter table public.ifood_daily_complementos
  drop constraint if exists ifood_daily_complementos_unit_id_date_nome_complemento_key;

-- Cria UNIQUE expression incluindo a classificação
create unique index if not exists ifood_daily_complementos_uniq
  on public.ifood_daily_complementos (
    unit_id,
    date,
    coalesce(classificacao, ''),
    nome_complemento
  );
