-- Consultor IA — Fase 2: preço e tamanho do pacote de perguntas extras.
-- Editável em /plataforma junto dos preços dos planos (Marcus: "decido depois").
-- Padrão: 100 perguntas por R$ 19,90.

alter table public.platform_settings
  add column if not exists ia_pack_price numeric(10, 2) not null default 19.90;

alter table public.platform_settings
  add column if not exists ia_pack_size int not null default 100;
