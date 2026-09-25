/*
 * Quais estrelas a resposta automática responde (Marcus, 25/09/26):
 * "pode ter clientes que quer que responda de 1 a 5".
 *
 * Por CLIENTE (a loja continua ligando/desligando em units). Padrão 4 e 5.
 * Nota baixa selecionada: a IA pede desculpas e diz que vai verificar — e
 * casos sensíveis (saúde, higiene, item faltando, reembolso, Procon) ficam
 * sempre pra uma pessoa. Ver `lib/avaliacoes/resposta-automatica.ts`.
 */

alter table public.holdings
  add column if not exists resposta_auto_notas smallint[] not null default '{4,5}'
    check (resposta_auto_notas <@ array[1,2,3,4,5]::smallint[]);

comment on column public.holdings.resposta_auto_notas is
  'Estrelas que a resposta automática de avaliações responde. Padrão {4,5}.';
