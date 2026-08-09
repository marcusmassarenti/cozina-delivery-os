-- Conserta o guarda da 0171: "conectado" não é o mesmo que "vende nessa
-- plataforma".
--
-- A 0171 carimbou como já-avisado quem tinha `api_store_id`, tratando esse
-- campo como sinal de conexão. Mas ele só existe pro iFood via API: loja com
-- dado de planilha, ou conectada por outro caminho (Cardápio Web usa
-- instalação, 99 Food usa store_links), passou pelo filtro como se fosse
-- conexão nova.
--
-- Consequência real em 09/08/26: 3 clientes receberam "o iFood está conectado,
-- já está trazendo os dados sozinho" pra lojas que nunca tiveram API. Os
-- números do e-mail eram verdadeiros (vinham de importação); a frase é que era
-- falsa. E 62 linhas continuavam na fila pra repetir no dia seguinte.
--
-- Aqui a supressão é retroativa e sem exceção: tudo que já existia sai da
-- fila. Só sobra o que conectar de agora em diante. O código (conexao-ativada
-- .ts) passou a aplicar o sinal certo por plataforma, então isto é rede de
-- proteção, não a correção principal.
update public.unit_platforms up
set email_conectado_at = now()
where up.email_conectado_at is null;
