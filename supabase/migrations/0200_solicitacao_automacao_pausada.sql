-- Pausar a régua automática de UMA solicitação de conexão.
--
-- POR QUE EXISTE: a régua cobra confirmação em 1 dia e recusa sozinha em 3.
-- Isso está certo quando a bola está com o cliente. Está ERRADO quando a bola
-- é do iFood: em ago/26, 10 lojas de 3 clientes apareciam "Ativo" no Portal do
-- Parceiro e o `GET /merchants` não devolvia nenhuma delas (403 no detalhe) --
-- bug do lado deles, com chamado aberto. Deixar a régua correr ali significa
-- mandar ao cliente um e-mail de recusa por uma falha que não é dele.
--
-- Timestamp, não booleano: "desde quando está pausado" é a pergunta que se faz
-- depois de duas semanas de fila parada. O motivo fica junto porque pausa sem
-- motivo escrito vira estado órfão que ninguém sabe se ainda vale despausar.
alter table public.ifood_activation_requests
  add column if not exists automacao_pausada_em timestamptz,
  add column if not exists automacao_pausada_motivo text;

comment on column public.ifood_activation_requests.automacao_pausada_em is
  'Quando a régua automática (cobrança em 1 dia + expiração em 3) foi pausada para esta solicitação. NULL = régua normal.';
comment on column public.ifood_activation_requests.automacao_pausada_motivo is
  'Por que está pausada — aparece no painel interno, nunca para o cliente.';
