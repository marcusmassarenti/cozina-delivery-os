/*
 * As colunas do Onboarding viram CADASTRO.
 *
 * Estavam fixas em três ('pronto', 'agendado', 'concluido') num CHECK, que é
 * o desenho certo quando o processo é do produto e errado quando o processo é
 * do CLIENTE. Cada agência tem o seu: uma passa por "aguardando contrato",
 * outra por "treinamento da equipe". Um CHECK obriga migration toda vez que
 * alguém muda o próprio jeito de trabalhar — o cliente não pode depender de
 * deploy pra isso (Marcus, 28/08/26).
 *
 * ── POR QUE `conclui` E NÃO "a última da lista" ─────────────────────────
 * Uma etapa precisa significar FIM, porque é ela que libera a passagem pro
 * gestor. Inferir isso da ordem quebraria no dia em que alguém acrescentasse
 * "pós-venda" depois de "concluído" e a regra passasse a exigir a etapa
 * errada. O significado é declarado, não deduzido da posição.
 */
create table if not exists public.carteira_etapas (
  id         uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings(id) on delete cascade,
  nome       text not null,
  ordem      int  not null default 0,
  /* A etapa que significa "terminou". Zero ou uma por agência. */
  conclui    boolean not null default false,
  criado_em  timestamptz not null default now(),
  unique (holding_id, nome)
);

comment on table public.carteira_etapas is
  'Colunas do quadro de onboarding, por agencia. Cada cliente define o proprio '
  'processo sem depender de deploy.';

create unique index if not exists carteira_etapas_uma_conclui
  on public.carteira_etapas (holding_id) where conclui;

alter table public.carteira_etapas enable row level security;
revoke all on public.carteira_etapas from anon, authenticated;

create index if not exists carteira_etapas_holding_idx
  on public.carteira_etapas (holding_id, ordem);

/*
 * A loja aponta pra etapa em vez de guardar um texto.
 *
 * `onboarding_status` fica no lugar por enquanto e sai numa migration
 * seguinte: derrubar coluna no mesmo deploy que introduz a nova deixa uma
 * janela em que o código antigo ainda em cache lê um campo que sumiu. Hoje
 * ela está vazia nas 129 lojas, então não há dado pra migrar.
 */
alter table public.units
  add column if not exists etapa_id uuid
    references public.carteira_etapas(id) on delete set null;

comment on column public.units.etapa_id is
  'Coluna do quadro de onboarding em que a loja esta. NULL = ainda sem etapa.';

create index if not exists units_etapa_idx
  on public.units (etapa_id) where etapa_id is not null;
