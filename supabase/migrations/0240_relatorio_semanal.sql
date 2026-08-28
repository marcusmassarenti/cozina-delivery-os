/*
 * Ciclo semanal da agência — Fase 1 do painel da carteira.
 *
 * ── O QUE ESTA TABELA GUARDA, E O QUE ELA NÃO GUARDA ──────────────────────
 * Guarda só o que NÃO dá pra calcular: o texto do relatório, quem entregou e
 * quando. O faturamento da semana fica de fora de propósito — ele é derivado
 * dos lançamentos, e gravar número derivado cria uma segunda verdade que
 * envelhece. No painel que a agência usa hoje esse campo é DIGITADO À MÃO
 * ("Informe o faturamento da semana"), e substituir isso é o motivo da fase.
 *
 * ── A SEMANA ──────────────────────────────────────────────────────────────
 * Segunda a domingo, entrega na QUARTA seguinte. Não é convenção nossa: o
 * gestor da Prime descreveu "semanal, toda quarta-feira" na reunião de
 * 25/08/26, e o painel do Diego mostra "Semana 1 · Vencimento 22/07/2026" —
 * 22/07/26 É uma quarta, 3 dias depois do domingo que fecha a semana.
 *
 * `semana_inicio` é a SEGUNDA. É a chave natural: uma linha por loja por
 * semana, e o vencimento se deriva dela. Guardar o vencimento junto seria
 * guardar o que a data já diz.
 */

create table if not exists public.relatorio_semanal (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units(id) on delete cascade,

  /* Segunda-feira da semana coberta. A trava garante que ninguém grave
     uma quarta aqui por engano e a semana inteira saia deslocada. */
  semana_inicio  date not null,
  constraint relatorio_semanal_segunda check (extract(isodow from semana_inicio) = 1),

  /* O texto é o produto da agência. O número a gente calcula; a leitura do
     número é o que o cliente dela paga. */
  texto          text,

  entregue_em    timestamptz,
  entregue_por   uuid references auth.users(id) on delete set null,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  unique (unit_id, semana_inicio)
);

comment on table public.relatorio_semanal is
  'Relatório semanal por loja (ciclo da agência). Guarda só o texto e a '
  'entrega — o faturamento da semana é DERIVADO dos lançamentos, nunca '
  'gravado aqui.';

comment on column public.relatorio_semanal.semana_inicio is
  'Segunda-feira da semana coberta. Vencimento = esta data + 9 dias (a quarta '
  'seguinte ao domingo que fecha a semana).';

/* A tela abre por loja e lista as últimas semanas — é sempre unit_id + ordem
   por semana desc. Índice único acima não serve: ele ordena por (unit_id,
   semana_inicio) ascendente e a varredura desc pagaria a inversão. */
create index if not exists relatorio_semanal_unit_semana_idx
  on public.relatorio_semanal (unit_id, semana_inicio desc);

/* Pendências da carteira inteira: "quais vencem hoje". Parcial porque a
   pergunta é sempre sobre o que NÃO foi entregue — e essas são minoria. */
create index if not exists relatorio_semanal_pendentes_idx
  on public.relatorio_semanal (semana_inicio)
  where entregue_em is null;

alter table public.relatorio_semanal enable row level security;

/* Fail-closed. Escrita e leitura passam pelo servidor, que já resolve o
   escopo do usuário — RLS aberta aqui seria uma segunda régua pra manter em
   dia, e carteira de cliente vazando pra outro é o erro mais caro deste
   sistema. */
revoke all on public.relatorio_semanal from anon, authenticated;

create or replace function public.relatorio_semanal_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists relatorio_semanal_touch_trg on public.relatorio_semanal;
create trigger relatorio_semanal_touch_trg
  before update on public.relatorio_semanal
  for each row execute function public.relatorio_semanal_touch();
