-- Degustação do Nino AI: libera o Nino (só o chat de IA) por um período curto
-- pra clientes dos planos Essencial/Pro experimentarem, sem virar plano AI.
-- Quando `nino_trial_ends_at` está no futuro, isAiPlan() passa a liberar; a
-- cota nesse período é enxuta (constante no código), não a cota cheia do AI.
alter table public.holdings
  add column if not exists nino_trial_ends_at timestamptz;

comment on column public.holdings.nino_trial_ends_at is
  'Fim da degustação do Nino AI (cortesia do dono). NULL = sem degustação. No futuro = Nino liberado com cota enxuta, sem ser plano AI.';
