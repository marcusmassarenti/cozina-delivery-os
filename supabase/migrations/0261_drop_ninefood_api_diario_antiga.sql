-- Remove a versão antiga do financeiro diário do 99 (bruto = renda, 0256).
-- A 0259 criou a `ninefood_api_diario_v2` (bruto = preço de cardápio) ao lado
-- dela pra não mudar o número em produção antes do deploy. O deploy e90c9c17
-- (21/09/26) passou a chamar só a v2; conferido que nenhum código, função ou
-- cron ainda referencia a antiga.
drop function if exists public.ninefood_api_diario(uuid[], date, date);
