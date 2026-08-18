-- Nota do Cardápio Web é FRACIONADA.
--
-- A coluna era `integer` e o Cardápio Web devolve nota 3.6 (medido na Churrasco
-- Royal em 18/08/26). A importação gravava 227 linhas e morria na avaliação com
-- "invalid input syntax for type integer: 3.6" — deixando o cliente com o dado
-- pela metade, sem erro visível na tela.
alter table public.cardapioweb_avaliacoes
  alter column nota type numeric using nota::numeric;
