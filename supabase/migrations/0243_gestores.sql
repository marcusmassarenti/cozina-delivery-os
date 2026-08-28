/*
 * Gestor e carteira — Fase 2 do painel da agência.
 *
 * ── O GESTOR NÃO É UM USUÁRIO ─────────────────────────────────────────────
 * Ele PODE ter login, e a maioria não tem. No painel do Diego são cinco nomes
 * — Diego, Paulo Victor, Janaina, William, Daniel — e o sistema precisa
 * ranquear os cinco mesmo que só um acesse. Amarrar gestor a `auth.users`
 * obrigaria a criar conta pra quem não vai usar, e conta que ninguém usa é
 * superfície de ataque parada.
 *
 * Por isso `user_id` é OPCIONAL: quando existe, dá pra um dia mostrar ao
 * gestor a própria carteira; quando não, ele continua sendo medido.
 *
 * ── POR QUE `gestor_id` FICA EM `units`, E NÃO NUMA TABELA DE VÍNCULO ─────
 * Uma loja tem UM gestor por vez — é assim no painel deles ("Gestor:
 * William") e é assim que a agência trabalha. Tabela de vínculo suportaria
 * vários, que não existe, e cobraria um join em toda tela que hoje lê
 * `units` direto.
 *
 * ── `entrada_carteira` NÃO É `data_inauguracao` ──────────────────────────
 * Inauguração é quando a LOJA abriu; entrada é quando a AGÊNCIA começou a
 * cuidar dela. O painel deles mostra as duas coisas ("Entrada: 15/07/2026 ·
 * Tempo em Gestão: 1 mês e 11 dias"), e confundi-las faria o tempo médio de
 * permanência — que é a métrica de churn da agência — medir a idade da loja.
 */

create table if not exists public.gestores (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  nome        text not null,
  /* Opcional de propósito — ver a nota acima. */
  user_id     uuid references auth.users(id) on delete set null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),

  /* Dois gestores com o mesmo nome na mesma agência é quase sempre erro de
     digitação, e o estrago aparece semanas depois num ranking com a carteira
     partida em dois. Barrar na entrada é mais barato que reconciliar. */
  unique (holding_id, nome)
);

comment on table public.gestores is
  'Gestor da carteira de uma agencia. user_id e OPCIONAL: o gestor e medido '
  'mesmo sem login.';

create index if not exists gestores_holding_idx
  on public.gestores (holding_id) where ativo;

alter table public.gestores enable row level security;
revoke all on public.gestores from anon, authenticated;

alter table public.units
  add column if not exists gestor_id uuid references public.gestores(id) on delete set null,
  add column if not exists entrada_carteira date;

comment on column public.units.gestor_id is
  'Quem cuida desta loja na agencia. Uma loja tem um gestor por vez.';
comment on column public.units.entrada_carteira is
  'Quando a AGENCIA passou a cuidar da loja — nao confundir com '
  'data_inauguracao, que e quando a loja abriu.';

/* A pergunta é sempre "as lojas do gestor X". Parcial porque loja sem gestor
   é a maioria hoje e não entra nessa pergunta. */
create index if not exists units_gestor_idx
  on public.units (gestor_id) where gestor_id is not null;
