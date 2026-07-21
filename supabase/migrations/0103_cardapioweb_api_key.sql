--------------------------------------------------------------------
-- 0103_cardapioweb_api_key.sql
--
-- Suporte ao segundo modo de autenticação do Cardápio Web.
--
-- O OAuth (0102) exige client_id, que só sai depois do cadastro da
-- integradora por e-mail (até 7 dias). Mas o Cardápio Web mantém o modelo
-- LEGADO por `X-API-KEY`, e o sandbox tem um estabelecimento de teste
-- PÚBLICO — o que destrava construir e validar o sync de pedidos antes de
-- ter qualquer credencial nossa.
--
-- Os dois modos convivem na mesma tabela:
--   auth_mode='oauth'   → Authorization: Bearer <access_token>, renova a cada 2h
--   auth_mode='api_key' → X-API-KEY: <token da loja>, não expira, sem refresh
--
-- Nos dois casos o segredo mora no Vault e `access_secret_id` aponta pra
-- ele — o que muda é só qual header o cliente HTTP monta.
--
-- Nota: no modo legado alguns endpoints (catálogo, formas de pagamento,
-- criar pedido) exigem TAMBÉM o `X-PARTNER-KEY`, que é o token da
-- integradora e vem por e-mail. Esse fica em env var (é nosso, não do
-- cliente), não aqui.
--
-- O legado será descontinuado pelo Cardápio Web — é ponte de
-- desenvolvimento, não destino.
--------------------------------------------------------------------

alter table public.cardapioweb_installs
  add column if not exists auth_mode text not null default 'oauth';

alter table public.cardapioweb_installs
  drop constraint if exists cardapioweb_installs_auth_mode_check;

alter table public.cardapioweb_installs
  add constraint cardapioweb_installs_auth_mode_check
  check (auth_mode in ('oauth', 'api_key'));

comment on column public.cardapioweb_installs.auth_mode is
  'oauth = Bearer com refresh de 2h. api_key = X-API-KEY legado (não expira). Nos dois, o segredo fica no Vault via access_secret_id.';
