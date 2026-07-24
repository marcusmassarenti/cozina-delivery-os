-- Habilitação POR APP do iFood, por loja.
--
-- Até aqui a conexão da loja era única: `unit_platforms.api_store_id` preenchido
-- servia os dois apps (financeiro E avaliações) ao mesmo tempo. Mas cada app é
-- autorizado SEPARADAMENTE no Portal do Parceiro — deu pra ter o financeiro
-- funcionando e as avaliações voltando 403 (caso DG Foods, 24/jul).
--
-- Estas colunas guardam o "OK do admin" por app: o timestamp de quando a
-- plataforma (Marcus) confirmou que aquele app foi autorizado pra loja.
-- NULL = ainda não habilitado. Só o iFood usa (99/Keeta ignoram).

alter table unit_platforms
  add column if not exists fin_enabled_at timestamptz,
  add column if not exists review_enabled_at timestamptz;

comment on column unit_platforms.fin_enabled_at is
  'iFood: quando o admin confirmou o app FINANCEIRO habilitado pra loja (NULL = não).';
comment on column unit_platforms.review_enabled_at is
  'iFood: quando o admin confirmou o app de AVALIAÇÕES habilitado pra loja (NULL = não).';

-- Backfill 1: financeiro já habilitado onde a loja está vinculada (tem merchant).
update unit_platforms
   set fin_enabled_at = coalesce(fin_enabled_at, now())
 where platform = 'ifood'
   and active
   and api_store_id is not null;

-- Backfill 2: avaliações já habilitado onde a loja JÁ puxa avaliações pela API
-- (não regredir as lojas da Cozina que já sincronizam). Sinal: avaliação com
-- `import_id IS NULL` só nasce do sync via API (o import por planilha sempre
-- carimba o import_id). O log platform_imports(source='api') é novo demais pra
-- servir de sinal aqui.
update unit_platforms up
   set review_enabled_at = coalesce(up.review_enabled_at, now())
 where up.platform = 'ifood'
   and up.active
   and up.api_store_id is not null
   and exists (
     select 1 from ifood_avaliacoes a
      where a.unit_id = up.unit_id
        and a.import_id is null
   );
