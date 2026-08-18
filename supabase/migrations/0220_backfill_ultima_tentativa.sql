-- Intervalo entre tentativas do backfill de histórico.
--
-- O contador de tentativas sozinho não olha o relógio: em 18/08/26 a CR Poços
-- gastou as 3 tentativas em 7 minutos (o cron rodou 3x seguidas) e foi
-- carimbada como concluída com 2 dos 8 meses. O extrato do iFood é ASSÍNCRONO
-- — pedir de novo em minutos não dá tempo dele existir.
alter table public.unit_platforms
  add column if not exists historico_ultima_tentativa timestamptz;
