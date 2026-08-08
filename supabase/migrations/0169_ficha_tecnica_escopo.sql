-- Ficha técnica: isolamento por cliente + escopo em cascata (loja → marca → rede).
--
-- POR QUE AGORA: as producao_* nasceram como cadastro interno da Cozina — um
-- cadastro só, global, visível apenas ao super-admin. Isso deixou de valer
-- quando a ficha técnica virou tela do Financeiro: sem holding_id, a DG FOODS
-- enxergaria a receita do Churrasco no Pote.
--
-- POR QUE CASCATA E NÃO SÓ "POR LOJA": os dois clientes têm formatos opostos.
--   • Churrasco no Pote — 3 marcas, 16 lojas, mesma receita dentro da marca.
--     Cadastrar 16 vezes o mesmo prato seria trabalho jogado fora.
--   • DG FOODS — 1 marca, 56 lojas, 56 DONOS DIFERENTES (confirmado pelo
--     Marcus). Herdar receita entre elas seria errado: são negócios distintos.
--
-- A ficha pertence a uma loja, ou a uma marca, ou à rede, e a busca vai de
-- baixo pra cima. Franquia cadastra na marca; carteira de clientes cadastra na
-- loja. Ninguém precisa reestruturar nada.

-- ── Isolamento por cliente ──────────────────────────────────────────────────
-- Nullable: as poucas linhas de hoje são teste interno e são adotadas abaixo.
alter table public.producao_insumo
  add column if not exists holding_id uuid references public.holdings(id) on delete cascade;
alter table public.producao_prato
  add column if not exists holding_id uuid references public.holdings(id) on delete cascade;
alter table public.producao_prato_nome
  add column if not exists holding_id uuid references public.holdings(id) on delete cascade;
alter table public.producao_ficha
  add column if not exists holding_id uuid references public.holdings(id) on delete cascade;

-- ── Escopo da ficha ─────────────────────────────────────────────────────────
alter table public.producao_ficha
  add column if not exists brand_id uuid references public.brands(id) on delete cascade,
  add column if not exists unit_id  uuid references public.units(id)  on delete cascade;

comment on column public.producao_ficha.brand_id is
  'Padrão da marca. Null + unit_id null = padrão da rede.';
comment on column public.producao_ficha.unit_id is
  'Exceção desta loja — vence o padrão da marca e o da rede.';

alter table public.producao_ficha drop constraint if exists producao_ficha_escopo_unico;
alter table public.producao_ficha
  add constraint producao_ficha_escopo_unico
  check (brand_id is null or unit_id is null);

-- ── Unicidades que eram GLOBAIS e não podiam continuar ──────────────────────
-- 1) UNIQUE (prato_id, insumo_codigo) impedia a loja de sobrescrever a marca,
--    que é exatamente o ponto da cascata.
alter table public.producao_ficha
  drop constraint if exists producao_ficha_prato_id_insumo_codigo_key;

drop index if exists producao_ficha_rede_idx;
drop index if exists producao_ficha_marca_idx;
drop index if exists producao_ficha_loja_idx;
create unique index producao_ficha_rede_idx
  on public.producao_ficha (prato_id, insumo_codigo)
  where brand_id is null and unit_id is null;
create unique index producao_ficha_marca_idx
  on public.producao_ficha (prato_id, insumo_codigo, brand_id)
  where brand_id is not null;
create unique index producao_ficha_loja_idx
  on public.producao_ficha (prato_id, insumo_codigo, unit_id)
  where unit_id is not null;

-- 2) UNIQUE (platform, nome_item) era global: o primeiro cliente que
--    cadastrasse "Coca-Cola 350ml" no iFood travaria todos os outros.
alter table public.producao_prato_nome
  drop constraint if exists producao_prato_nome_platform_nome_item_key;
drop index if exists producao_prato_nome_holding_idx;
create unique index producao_prato_nome_holding_idx
  on public.producao_prato_nome (holding_id, platform, nome_item);

-- 3) producao_insumo tinha PRIMARY KEY (codigo), global. Dois restaurantes
--    podem ter, cada um, um insumo "001".
--
--    A FK producao_ficha.insumo_codigo → producao_insumo.codigo é derrubada de
--    propósito e recriada COMPOSTA. Explicitamente, sem `cascade`: com cascade
--    ela sumiria em silêncio junto com a PK, e a ficha passaria a aceitar
--    código de insumo que não existe.
alter table public.producao_ficha
  drop constraint if exists producao_ficha_insumo_codigo_fkey;
alter table public.producao_insumo
  drop constraint if exists producao_insumo_pkey;

drop index if exists producao_insumo_holding_codigo_idx;
create unique index producao_insumo_holding_codigo_idx
  on public.producao_insumo (holding_id, codigo);

alter table public.producao_ficha
  drop constraint if exists producao_ficha_insumo_fkey;
alter table public.producao_ficha
  add constraint producao_ficha_insumo_fkey
  foreign key (holding_id, insumo_codigo)
  references public.producao_insumo (holding_id, codigo)
  on delete restrict;

create index if not exists producao_ficha_holding_idx on public.producao_ficha (holding_id);
create index if not exists producao_prato_holding_idx on public.producao_prato (holding_id);

-- ── Adota as linhas de teste ────────────────────────────────────────────────
-- Os 2 insumos e os 3 pratos que existem são da Cozina (códigos CNP). Sem dono
-- eles ficariam invisíveis pela RLS e órfãos da FK composta.
update public.producao_insumo set holding_id = h.id
  from public.holdings h where h.name = 'Churrasco no Pote' and producao_insumo.holding_id is null;
update public.producao_prato set holding_id = h.id
  from public.holdings h where h.name = 'Churrasco no Pote' and producao_prato.holding_id is null;
update public.producao_prato_nome set holding_id = h.id
  from public.holdings h where h.name = 'Churrasco no Pote' and producao_prato_nome.holding_id is null;
update public.producao_ficha set holding_id = h.id
  from public.holdings h where h.name = 'Churrasco no Pote' and producao_ficha.holding_id is null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Não tinham: eram cadastro interno acessado só pelo servidor. Agora que a
-- tela é de cliente, o isolamento passa a valer também no banco.
alter table public.producao_insumo enable row level security;
alter table public.producao_prato enable row level security;
alter table public.producao_prato_nome enable row level security;
alter table public.producao_ficha enable row level security;

drop policy if exists "producao_insumo_select" on public.producao_insumo;
drop policy if exists "producao_prato_select" on public.producao_prato;
drop policy if exists "producao_prato_nome_select" on public.producao_prato_nome;
drop policy if exists "producao_ficha_select" on public.producao_ficha;

create policy "producao_insumo_select" on public.producao_insumo for select
  using (holding_id is not null and public.has_holding_access(holding_id));
create policy "producao_prato_select" on public.producao_prato for select
  using (holding_id is not null and public.has_holding_access(holding_id));
create policy "producao_prato_nome_select" on public.producao_prato_nome for select
  using (holding_id is not null and public.has_holding_access(holding_id));
create policy "producao_ficha_select" on public.producao_ficha for select
  using (holding_id is not null and public.has_holding_access(holding_id));
