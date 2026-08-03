-- Status "arquivada" nas solicitações de conexão do iFood.
--
-- Os quatro status existentes (pendente, solicitada, ativa, recusada) não têm
-- nenhum que signifique RESOLVIDA. Consequência: uma recusa fica no painel pra
-- sempre, e a única saída era "Desfazer" -- que REABRE o pedido, o oposto do
-- que se quer.
--
-- Em 03/ago/26 duas recusas de 29/jul ainda ocupavam a fila: uma da Casa Nossa
-- (feita com o CNPJ errado, já substituída por uma solicitação ativa) e uma da
-- Gi Burguer (pedido de iFood pra loja que só usa Keeta e 99 Food). Nenhuma das
-- duas exigia ação, e não havia como tirá-las da tela.
--
-- Com 500 clientes o painel viraria um cemitério de recusas antigas misturadas
-- com o que de fato precisa de ação -- e fila que ninguém confia é fila que
-- ninguém olha.
--
-- "arquivada" tira da fila SEM apagar: o histórico da loja continua lá, com a
-- nota do motivo.

alter table ifood_activation_requests
  drop constraint if exists ifood_activation_requests_status_check,
  drop constraint if exists ifood_activation_requests_status_anterior_check;

alter table ifood_activation_requests
  add constraint ifood_activation_requests_status_check
    check (status = any (array['pendente','solicitada','ativa','recusada','arquivada'])),
  add constraint ifood_activation_requests_status_anterior_check
    check (status_anterior is null or status_anterior = any
      (array['pendente','solicitada','ativa','recusada','arquivada']));
