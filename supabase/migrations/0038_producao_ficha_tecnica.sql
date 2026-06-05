-- 0038_producao_ficha_tecnica.sql
-- Ficha técnica (de-para) pra integração de demanda → produção (ERP industrial).
--
-- Converte o que as lojas VENDEM no delivery (pratos, com nome bagunçado e
-- diferente entre iFood / 99 Food / Keeta) na DEMANDA DE INSUMOS do ERP
-- (códigos CNP), pra gerar previsibilidade de produção / estoque na indústria.
--
-- Modelo (1 prato pode virar VÁRIOS insumos):
--   producao_insumo      — catálogo dos insumos do ERP (código CNP, nome, un)
--   producao_prato       — prato canônico (consolida os nomes das plataformas)
--   producao_prato_nome  — de-para: (plataforma, nome do item vendido) → prato
--   producao_ficha       — ficha técnica: prato → insumo × quantidade
--
-- Tudo é cadastro GLOBAL da rede. RLS ligado SEM policy (acesso só pelo admin
-- client / service-role no servidor, igual ao api_clients). As telas aplicam
-- guard de admin no app. Dados portáveis: se um dia a ficha migrar pro ERP,
-- é só exportar estas tabelas.

-- ── Catálogo de insumos do ERP ───────────────────────────────────────
create table public.producao_insumo (
  codigo      text primary key,                  -- ex.: "CNP053"
  nome        text not null,                      -- ex.: "BRISKET 100G"
  unidade     text not null default 'UN',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Prato canônico (o que a loja vende, consolidado) ──────────────────
create table public.producao_prato (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── De-para: nome do item na plataforma → prato canônico ──────────────
create table public.producao_prato_nome (
  id          uuid primary key default gen_random_uuid(),
  prato_id    uuid not null references public.producao_prato(id) on delete cascade,
  platform    text not null check (platform in ('ifood', '99food', 'keeta')),
  nome_item   text not null,
  created_at  timestamptz not null default now(),
  unique (platform, nome_item)
);
create index producao_prato_nome_prato_idx on public.producao_prato_nome (prato_id);

-- ── Ficha técnica: prato → insumo × quantidade ────────────────────────
create table public.producao_ficha (
  id            uuid primary key default gen_random_uuid(),
  prato_id      uuid not null references public.producao_prato(id) on delete cascade,
  insumo_codigo text not null references public.producao_insumo(codigo) on delete restrict,
  qtd           numeric not null default 0,       -- qtd do insumo por 1 prato vendido
  created_at    timestamptz not null default now(),
  unique (prato_id, insumo_codigo)
);
create index producao_ficha_prato_idx on public.producao_ficha (prato_id);

-- ── touch updated_at ──────────────────────────────────────────────────
create or replace function public.producao_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists producao_insumo_touch on public.producao_insumo;
create trigger producao_insumo_touch before update on public.producao_insumo
  for each row execute function public.producao_touch_updated_at();

drop trigger if exists producao_prato_touch on public.producao_prato;
create trigger producao_prato_touch before update on public.producao_prato
  for each row execute function public.producao_touch_updated_at();

-- ── RLS: só service-role (admin client no servidor) ───────────────────
alter table public.producao_insumo      enable row level security;
alter table public.producao_prato        enable row level security;
alter table public.producao_prato_nome   enable row level security;
alter table public.producao_ficha        enable row level security;
-- Sem policies de propósito: acesso só pelo admin client (server-only).
