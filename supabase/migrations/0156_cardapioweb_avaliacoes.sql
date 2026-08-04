-- Avaliações do Cardápio Web.
--
-- O que faz esta fonte valer mais que a do iFood: além de nota e comentário,
-- cada avaliação traz SUB-NOTAS por dimensão (atendimento, qualidade do
-- produto, embalagem, tempo de entrega, custo/benefício). No iFood a loja sabe
-- que levou 3 estrelas; aqui sabe QUAL parte puxou a nota pra baixo.
--
-- `respostas` é jsonb e não colunas: as dimensões chegam como lista de
-- pergunta/resposta e podem mudar de nome ou de quantidade sem aviso. Coluna
-- por dimensão viraria migration a cada mudança deles.

create table if not exists public.cardapioweb_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.cardapioweb_installs(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,

  review_id text not null,
  order_id text,
  customer_cw_id text,

  nota int,
  comentario text,
  respostas jsonb,

  criado_em timestamptz,
  ref_year int,
  ref_month int,

  raw jsonb,
  synced_at timestamptz not null default now(),

  -- A listagem da API não filtra por data: toda sincronização varre do começo.
  -- Como avaliação não muda depois de escrita, o upsert por (install, review)
  -- faz a repetição sair de graça.
  unique (install_id, review_id)
);

comment on table public.cardapioweb_avaliacoes is
  'Avaliacoes do Cardapio Web. Diferente do iFood, traz sub-notas por dimensao.';

create index if not exists cardapioweb_avaliacoes_unit_periodo
  on public.cardapioweb_avaliacoes (unit_id, ref_year, ref_month);
create index if not exists cardapioweb_avaliacoes_install
  on public.cardapioweb_avaliacoes (install_id, criado_em desc);

-- RLS ligada e SEM policy: só o servidor (service_role) enxerga. Sem isso, a
-- tabela ficaria legível por qualquer um que apontasse o PostgREST pra ela.
alter table public.cardapioweb_avaliacoes enable row level security;
