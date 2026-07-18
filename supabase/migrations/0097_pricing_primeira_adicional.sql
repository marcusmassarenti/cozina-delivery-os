-- Precificação "primeira loja + adicionais" (derruba a barreira de quem tem
-- muitas lojas). O preço deixa de ser linear (perUnit × N).
--
-- Semântica nova das colunas em platform_settings:
--   *_per_unit  = preço da PRIMEIRA loja (base anual/mês, como antes)
--   *_add       = preço de cada loja ADICIONAL (base anual/mês)
--
-- Mensalidade do plano = primeira + adicional × (nº de lojas − 1).

alter table public.platform_settings
  add column if not exists essencial_add numeric(10, 2) not null default 19,
  add column if not exists pro_add numeric(10, 2) not null default 39,
  add column if not exists ai_add numeric(10, 2) not null default 49;

-- A primeira loja do AI passa a custar 149 (era 159 no modelo linear). Só toca
-- o valor se ainda estiver no padrão antigo — não sobrescreve preço custom.
update public.platform_settings
set ai_per_unit = 149
where id = 1
  and ai_per_unit = 159;
