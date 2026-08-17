-- Categorias PADRÃO do cliente, sugeridas em todas as lojas.
--
-- ── POR QUE UMA TABELA SÓ PRA ISSO ──────────────────────────────────────
-- A categoria do item já mora em `item_custos.categoria`, e por um tempo isso
-- bastou: o `datalist` da tela oferecia o que já tinha sido digitado NAQUELA
-- loja. O problema aparece na segunda loja — ela começa com a lista vazia, e
-- quem preenche escreve "Bebida" onde a primeira escreveu "Bebidas". Em dez
-- lojas viram dez vocabulários e o filtro por categoria deixa de significar
-- alguma coisa na rede.
--
-- Esta tabela é a LISTA OFERECIDA, não o vínculo: continua sendo
-- `item_custos.categoria` quem diz a categoria de cada item. Quem cadastra
-- aqui está dizendo "estas são as categorias da minha operação", e toda loja
-- passa a sugerir as mesmas.
create table if not exists public.item_categorias (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings(id) on delete cascade,
  nome text not null,
  -- Ordem de exibição escolhida pelo cliente. O cardápio dele tem uma ordem
  -- natural (entrada → prato → bebida → sobremesa) que alfabética destrói.
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  unique (holding_id, nome)
);

comment on table public.item_categorias is
  'Categorias padrão do cliente, sugeridas em todas as lojas. O vínculo item→categoria continua em item_custos.categoria.';

create index if not exists item_categorias_holding_idx on public.item_categorias (holding_id, ordem);

alter table public.item_categorias enable row level security;

drop policy if exists item_categorias_select on public.item_categorias;
create policy item_categorias_select on public.item_categorias for select
  using (public.has_holding_access(holding_id));
-- Escrita só via service_role, atrás da server action que checa permissão.
