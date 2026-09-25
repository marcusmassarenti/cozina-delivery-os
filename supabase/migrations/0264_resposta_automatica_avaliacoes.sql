/*
 * Resposta automática de avaliações do iFood (Marcus, 25/09/26).
 *
 * Na DG, 4.556 avaliações em 30 dias e 26 respondidas. A Koike: 139 e 1. O
 * prazo do iFood é 5 dias; passou, a avaliação é publicada sem resposta.
 *
 * Regras (o código mora em `lib/avaliacoes/resposta-automatica.ts`):
 *  - só nota 4 e 5, só loja que LIGOU a opção (padrão desligado — ninguém
 *    publica em nome da loja sem ela ter escolhido);
 *  - sem comentário → resposta de um banco de modelos (todos os planos);
 *  - com comentário → IA, só no plano AI; se houver reclamação, não publica;
 *  - notas 1–3 nunca: vão pro popup, pra uma pessoa responder.
 */

alter table public.units
  add column if not exists resposta_auto_avaliacoes boolean not null default false,
  add column if not exists resposta_auto_ativada_por uuid references auth.users(id) on delete set null,
  add column if not exists resposta_auto_ativada_em timestamptz;

comment on column public.units.resposta_auto_avaliacoes is
  'Responder automaticamente avaliações nota 4-5 do iFood desta loja.';

alter table public.ifood_avaliacoes
  /* Quem escreveu a resposta: o painel (pessoa), o banco de modelos ou a IA.
     Nulo = respondida pelo portal do iFood ou antes desta coluna existir. */
  add column if not exists resposta_origem text
    check (resposta_origem in ('manual', 'modelo', 'ia')),
  /* Por que a automática NÃO respondeu (reclamação, recusa do iFood...).
     Gravado pra não reavaliar — nem gastar IA — todo dia com a mesma
     avaliação; ela continua na fila de "Esperando resposta" pra uma pessoa. */
  add column if not exists resposta_auto_pulada text;

create index if not exists ifood_avaliacoes_pendentes_auto_idx
  on public.ifood_avaliacoes (unit_id, data_avaliacao)
  where status_avaliacao = 'NOT_REPLIED' and resposta_texto is null;
