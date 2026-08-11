-- Coluna `cancelamentos_de_responsabilidade_da_loja` da planilha do Super.
--
-- Estava no arquivo desde sempre e nunca foi gravada. Importa porque separa
-- "quantos pedidos foram cancelados" de "quantos foram CULPA da loja" — e só
-- o segundo conta contra o selo. Sem ela, uma loja com muito cancelamento do
-- cliente parece estar em risco quando não está.

alter table public.ifood_super_avaliacao
  add column if not exists cancelamentos_da_loja integer;

comment on column public.ifood_super_avaliacao.cancelamentos_da_loja is
  'Cancelamentos de responsabilidade DA LOJA — é o que conta pro critério do Super.';
