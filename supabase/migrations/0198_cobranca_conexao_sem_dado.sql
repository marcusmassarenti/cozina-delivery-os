-- Carimbo de "já cobrei a confirmação deste cliente sobre ESTA loja".
--
-- A trava padrão de e-mail é (holding_id, tipo) e não serve aqui: o aviso é
-- UM por cliente listando as lojas paradas dele, então a trava por cliente
-- avisaria de uma loja e engoliria as outras. Foi esse o caso que criou o
-- e-mail — a Tech Assessoria tem TRÊS lojas paradas ao mesmo tempo.
--
-- Marcado por solicitação, o carimbo diz exatamente o que se quer saber:
-- desta loja o cliente já foi cobrado, daquela ainda não.
alter table ifood_activation_requests
  add column if not exists cobranca_enviada_em timestamptz;

comment on column ifood_activation_requests.cobranca_enviada_em is
  'quando o cliente foi cobrado a confirmar se aprovou a conexão desta loja (e-mail conexao-sem-dado). null = nunca cobrado';

-- A varredura procura por solicitações abertas e antigas; o índice evita
-- varrer a tabela inteira todo dia.
create index if not exists ifood_activation_requests_cobranca_idx
  on ifood_activation_requests (status, created_at)
  where cobranca_enviada_em is null;
