--------------------------------------------------------------------
-- 0120_ifood_merchants_cnpj_sondado.sql
--
-- Evita re-baixar a conciliação de uma loja que não tem extrato.
--
-- A Merchant API não expõe CNPJ, então o auto-link descobre baixando a
-- Conciliação de cada merchant. Quando ACHA, grava em `cnpj` e as
-- próximas rodadas saem de graça. Quando NÃO acha — loja recém-aberta,
-- sem movimento — nada era gravado, e o mesmo download acontecia de
-- novo pra cada solicitação testada e a cada rodada do cron de 15 min.
--
-- Com o carimbo, uma loja sem extrato é sondada no máximo uma vez por
-- janela; e como só o `cnpj` decide o vínculo, nada muda no resultado.
--------------------------------------------------------------------

alter table public.ifood_merchants
  add column if not exists cnpj_sondado_em timestamptz;

comment on column public.ifood_merchants.cnpj_sondado_em is
  'Ultima tentativa de descobrir o CNPJ baixando a conciliacao. Loja sem '
  'extrato (recem-aberta, sem movimento) nunca devolve CNPJ; sem esta marca '
  'o auto-link rebaixava a mesma conciliacao a cada rodada de 15 min.';
