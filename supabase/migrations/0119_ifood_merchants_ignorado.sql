--------------------------------------------------------------------
-- 0119_ifood_merchants_ignorado.sql
--
-- Permite ARQUIVAR um merchant do iFood que não vai ser vinculado.
--
-- Motivo real: nem toda loja autorizada no app vira unidade da rede —
-- tem loja de teste do próprio integrador e loja que o cliente desativou.
-- Elas ficavam eternamente no bloco "Sem unidade vinculada", que é a
-- lista do que EXIGE AÇÃO, poluindo o único lugar da tela que deveria
-- ser sempre curto.
--
-- Apagar a linha não resolve: no próximo "Re-puxar da Merchant API" ela
-- volta, porque continua autorizada no iFood. Por isso é um carimbo e
-- não um DELETE — sobrevive ao refresh (o upsert não toca nesta coluna)
-- e é reversível, sem perder o histórico de que a loja existiu.
--------------------------------------------------------------------

alter table public.ifood_merchants
  add column if not exists ignorado_em timestamptz,
  add column if not exists ignorado_motivo text;

comment on column public.ifood_merchants.ignorado_em is
  'Quando o admin arquivou este merchant. Preenchido = sai do bloco de '
  'pendencias e vai pra secao Ignoradas. Nulo = fluxo normal.';

comment on column public.ifood_merchants.ignorado_motivo is
  'Por que foi arquivado (ex.: loja de teste, desativada pelo cliente).';
