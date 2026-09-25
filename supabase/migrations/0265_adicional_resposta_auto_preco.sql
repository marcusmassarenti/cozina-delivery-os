/*
 * Preço do adicional "Resposta automática de avaliações" (Marcus, 25/09/26).
 *
 * Cobrado POR LOJA LIGADA, somado à mensalidade (regra única em
 * `lib/data/mensalidade.ts`), a partir da próxima fatura.
 *
 *  - platform_settings.resposta_auto_preco_loja: o padrão da plataforma,
 *    que o Marcus edita na tela de preços. Começa em R$ 25.
 *  - holdings.resposta_auto_preco_loja: valor combinado com UM cliente.
 *    Nulo = usa o padrão; 0 = cortesia (liga sem cobrar).
 */

alter table public.platform_settings
  add column if not exists resposta_auto_preco_loja numeric(10,2) not null default 25;

alter table public.holdings
  add column if not exists resposta_auto_preco_loja numeric(10,2)
    check (resposta_auto_preco_loja is null or resposta_auto_preco_loja >= 0);

comment on column public.holdings.resposta_auto_preco_loja is
  'Preço por loja do adicional de resposta automática para este cliente. Nulo = padrão da plataforma; 0 = cortesia.';
