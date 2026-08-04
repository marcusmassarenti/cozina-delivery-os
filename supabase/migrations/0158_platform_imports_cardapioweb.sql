-- `platform_imports` só aceitava os 3 marketplaces no CHECK.
--
-- A migration 0117 ("unit_platforms aceita cardapioweb") lista
-- `platform_imports` no comentário de cabeçalho como se tivesse coberto, mas o
-- constraint ficou de fora. Comentário de migration que promete e não entrega é
-- pior que nenhum: quem lê acredita e não confere.
--
-- Sem isto, o sync do Cardápio Web não consegue registrar no Histórico de
-- Importações — o banco recusa a linha. Pro lojista, a integração roda todo dia
-- e a tela diz "Nenhuma importação ainda", como se nada estivesse acontecendo.

alter table public.platform_imports
  drop constraint if exists platform_imports_platform_check;

alter table public.platform_imports
  add constraint platform_imports_platform_check
  check (platform = any (array['ifood'::text, '99food'::text, 'keeta'::text, 'cardapioweb'::text]));
