-- Para onde vai cada R$ 100 — calculado, não digitado.
--
-- ── POR QUE (Marcus, 24/08/26) ───────────────────────────────────────────
-- O bloco "As taxas levam R$ 45. Sobra só R$ 55" da landing tinha os cinco
-- valores escritos à mão (comissão 23, entrega 7, cupom 6, frete grátis 6,
-- transação 3). Números inventados quando existe medição na própria base.
--
-- E o medido é MAIS FORTE que o inventado: na rede consolidada saem R$ 35,50
-- de cada R$ 100; na loja MEDIANA, R$ 31,50; mas uma em cada dez passa de
-- R$ 60. "Podem sumir R$ 45" é vago; "uma em cada dez perde mais de R$ 60" é
-- específico, verificável, e assusta exatamente quem precisa.
--
-- Guardado como jsonb porque a composição muda de forma (a Keeta pode entrar
-- com taxas próprias, o iFood pode criar uma linha nova) — e alterar tabela a
-- cada mudança de rótulo seria migration por texto de marketing.
alter table public.landing_numeros
  add column if not exists por_cem jsonb;

comment on column public.landing_numeros.por_cem is
  'Para onde vai cada R$ 100 de faturamento: segmentos, quanto sobra, a loja mediana e o percentil 90. Substituiu numeros digitados a mao na landing.';
