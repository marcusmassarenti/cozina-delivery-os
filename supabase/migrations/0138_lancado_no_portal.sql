-- Marca que o CNPJ já foi lançado à mão no Portal do Desenvolvedor do iFood.
-- O portal só aceita um CNPJ por vez; num lote de 14 lojas é fácil perder o
-- fio de quais já passaram. Sem isso, "solicitada" não distingue "eu lancei e
-- estou esperando" de "eu ainda nem lancei".
alter table ifood_activation_requests
  add column if not exists lancado_no_portal_at timestamptz;

comment on column ifood_activation_requests.lancado_no_portal_at is
  'Quando o CNPJ foi lançado no Portal do Desenvolvedor (controle manual do operador).';
