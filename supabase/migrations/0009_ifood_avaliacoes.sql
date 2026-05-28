--------------------------------------------------------------------
-- 0009_ifood_avaliacoes.sql
-- Importação do relatório "Avaliações" do iFood (menu Operação).
-- Cada linha = 1 avaliação (nota + tags + comentário) ligada a 1 pedido.
--
-- Tags vêm como arrays de texto pra flexibilidade — o iFood pode
-- adicionar novas tags no futuro sem precisar de migration nova.
--------------------------------------------------------------------

create table public.ifood_avaliacoes (
  id                   uuid primary key default uuid_generate_v4(),
  unit_id              uuid not null references public.units(id) on delete cascade,

  -- Pedido associado
  pedido_id_curto      text,             -- '6350' — cruza com Financeiro
  pedido_id_longo      text,             -- uuid do iFood
  data_pedido          timestamptz,
  status_pedido        text,             -- 'CONCLUÍDO'
  servico_logistico    text,             -- 'IFOOD_DELIVERY'

  -- Avaliação
  data_avaliacao       date not null,
  nota                 integer not null check (nota >= 1 and nota <= 5),
  comentario           text,
  status_avaliacao     text,             -- 'PUBLICADA' | 'REMOVIDA' | etc.

  -- Tags marcadas pelo cliente (arrays porque o iFood vai adicionar
  -- novas categorias no futuro — assim não precisa migration)
  tags_positivas       text[] not null default '{}',
  tags_negativas       text[] not null default '{}',

  -- Audit
  import_id            uuid references public.platform_imports(id) on delete set null,
  imported_at          timestamptz not null default now(),

  -- 1 avaliação por pedido (idempotência no re-import)
  unique (unit_id, pedido_id_longo)
);

create index ifood_avaliacoes_unit_data_idx
  on public.ifood_avaliacoes (unit_id, data_avaliacao desc);

create index ifood_avaliacoes_nota_idx
  on public.ifood_avaliacoes (unit_id, nota);

-- Permite buscar avaliações que mencionam X tag
create index ifood_avaliacoes_tags_pos_gin
  on public.ifood_avaliacoes using gin (tags_positivas);

create index ifood_avaliacoes_tags_neg_gin
  on public.ifood_avaliacoes using gin (tags_negativas);

alter table public.ifood_avaliacoes enable row level security;

create policy "ifood_avaliacoes_select_with_access"
  on public.ifood_avaliacoes for select
  using (public.has_unit_access(unit_id));
