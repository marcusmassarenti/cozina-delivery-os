-- 0258: cortesia combinada (Marcus, 14/09/2026)
-- Cliente de verdade que usa sem pagar. Diferente de conta_interna: fica fora do
-- MRR, dos pagantes, das faturas, do Asaas e da régua de cobrança, mas continua
-- recebendo e-mail de produto e resumo semanal.
alter table public.holdings add column if not exists cortesia boolean not null default false;
alter table public.holdings add column if not exists cortesia_nota text;
comment on column public.holdings.cortesia is
  'Cortesia combinada: usa sem pagar. Fora de MRR/faturas/Asaas/régua de cobrança; recebe e-mails de produto.';
