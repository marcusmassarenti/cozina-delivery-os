-- Trava de execução única pra sincronizações pesadas.
--
-- O botão "Sincronizar iFood (todos)" percorre a base inteira e escreve numa
-- tabela de 1,9 milhão de linhas. Uma execução já é pesada; DUAS ao mesmo
-- tempo saturam o disco do banco e TODO o resto da plataforma entra na fila —
-- login incluído.
--
-- E duas ao mesmo tempo é o caso comum, não o raro: no celular a requisição
-- estoura o tempo do navegador ("Load failed") enquanto o servidor continua
-- trabalhando. Quem vê o erro clica de novo, e agora são duas. Foi assim em
-- 21/08/26, com a plataforma travada por minutos.
--
-- Advisory lock do Postgres não serve aqui: o PostgREST usa uma conexão por
-- requisição, e a trava morreria junto com ela. Por isso é uma linha mesmo.
create table if not exists public.sync_locks (
  nome text primary key,
  iniciado_em timestamptz not null default now(),
  -- Quem pegou a trava. Só pra diagnóstico: saber se foi o cron ou um clique.
  origem text
);

alter table public.sync_locks enable row level security;
revoke all on public.sync_locks from anon, authenticated;

comment on table public.sync_locks is
  'Uma linha = uma sincronização pesada em andamento. A linha some ao terminar; trava velha demais é considerada abandonada e pode ser retomada.';
