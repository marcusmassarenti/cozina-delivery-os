--------------------------------------------------------------------
-- 0078_holding_enabled_reports.sql
-- Quais relatórios (das 3 plataformas) a operação usa.
--
-- Mapa { report_key: bool } por holding. NULL = ainda não configurou →
-- o app usa os essenciais como padrão (DEFAULT_ENABLED_REPORTS no código).
-- Os relatórios desligados somem do guia de importação, da cobertura e do
-- "não integrado" do Diagnóstico, pra não confundir o operador.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists enabled_reports jsonb;

comment on column public.holdings.enabled_reports is
  'Mapa report_key -> bool dos relatórios habilitados na operação. NULL = usa os essenciais (padrão).';
