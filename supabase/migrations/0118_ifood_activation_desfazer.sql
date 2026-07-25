--------------------------------------------------------------------
-- 0118_ifood_activation_desfazer.sql
--
-- Permite DESFAZER uma mudança de status na fila de ativação iFood.
--
-- Motivo real: os botões "Loja vinculada — ativar" e "Recusar" ficam lado
-- a lado, e um clique errado marcava a loja como recusada sem volta. Do
-- lado do CLIENTE isso não é cosmético: recusada some do aviso da home,
-- então ele para de ser lembrado de aprovar no Portal do Parceiro e a
-- conexão morre em silêncio.
--
-- Guarda o status ANTERIOR em vez de assumir um valor no desfazer: uma
-- recusa pode vir de 'pendente' (antes de eu abrir o portal) ou de
-- 'solicitada' (já pedi, faltava o cliente aprovar). Restaurar o valor
-- errado mandaria a loja pro passo errado da fila.
--------------------------------------------------------------------

alter table public.ifood_activation_requests
  add column if not exists status_anterior text
    check (status_anterior in ('pendente', 'solicitada', 'ativa', 'recusada'));

comment on column public.ifood_activation_requests.status_anterior is
  'Status imediatamente anterior, gravado a cada mudança. Serve pro botao '
  'Desfazer restaurar o passo certo da fila em vez de assumir um valor.';
