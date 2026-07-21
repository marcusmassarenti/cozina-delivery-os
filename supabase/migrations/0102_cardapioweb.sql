--------------------------------------------------------------------
-- 0102_cardapioweb.sql
--
-- Integração com o Cardápio Web (hub de pedidos).
--
-- Diferença importante pras integrações que já temos: iFood e 99 usam
-- credencial NOSSA (env var, uma pra rede toda). Aqui a credencial é DO
-- CLIENTE — cada loja autoriza o app dele via OAuth 2.0 + PKCE e devolve
-- um access_token (2h) + refresh_token. Como precisamos USAR o token
-- depois, não dá pra guardar hash (jeito do api_clients): o token vai
-- criptografado no **Supabase Vault** e a tabela guarda só o id do segredo.
--
-- O Cardápio Web NÃO tem endpoint que liste as lojas de uma rede: é uma
-- instalação (e um par de tokens) POR LOJA. Por isso `cardapioweb_installs`
-- é a unidade de tudo — sync, cursor e dados penduram nela.
--
-- Tabelas:
--   1) cardapioweb_installs        · 1 linha por loja conectada
--   2) cardapioweb_oauth_states    · estado efêmero do fluxo OAuth (PKCE)
--   3) cardapioweb_pedidos         · pedido (cabeçalho) — é TAMBÉM a fila
--      do detalhamento, via `detalhe_ok` (ver nota N+1 abaixo)
--   4) cardapioweb_pedido_itens    · itens do pedido
--   5) cardapioweb_pedido_opcoes   · complementos de cada item
--   6) cardapioweb_clientes        · base de clientes da loja
--   7) cardapioweb_catalogo_itens  · snapshot do cardápio
--   8) cardapioweb_sync_state      · cursor de backfill/incremental por loja
--   9) cardapioweb_api_logs        · auditoria das chamadas (espelha ifood_api_logs)
--
-- NOTA N+1: nenhuma listagem do Cardápio Web traz os itens — nem o polling
-- nem o /orders/history. Ambos devolvem um "LiteOrder" (id + status). Os
-- itens exigem GET /orders/{id}, um por pedido, com teto de 300 req/3min
-- por loja. Por isso gravamos o cabeçalho primeiro com detalhe_ok=false e
-- um job retomável vai preenchendo — se a execução morrer no meio, ela
-- recomeça de onde parou em vez de refazer tudo.
--
-- RLS: habilitada e SEM policies de propósito. Só o service_role (admin
-- client no servidor) toca essas tabelas, igual ao padrão do api_clients.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

-- 1) Instalações (loja conectada) -------------------------------------------
create table if not exists public.cardapioweb_installs (
  id                uuid primary key default gen_random_uuid(),
  holding_id        uuid not null references public.holdings(id) on delete cascade,
  -- Vínculo com a nossa unidade. Pode ficar null logo após o OAuth e ser
  -- amarrado depois na tela de importação (mesmo fluxo do 99).
  unit_id           uuid references public.units(id),
  ambiente          text not null default 'sandbox'
                      check (ambiente in ('sandbox', 'producao')),
  -- Identificação da loja no Cardápio Web (vem do GET /merchant).
  merchant_id       text,
  merchant_name     text,
  merchant_slug     text,
  scopes            text[] not null default '{}',
  -- Ids dos segredos no Vault (NUNCA o token em si).
  access_secret_id  uuid,
  refresh_secret_id uuid,
  token_expires_at  timestamptz,
  active            boolean not null default true,
  -- Motivo de desativação (ex.: refresh_token revogado pelo lojista).
  inactive_reason   text,
  installed_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Uma loja do CW só pode estar conectada uma vez por ambiente.
create unique index if not exists cardapioweb_installs_merchant_idx
  on public.cardapioweb_installs (ambiente, merchant_id)
  where merchant_id is not null;
create index if not exists cardapioweb_installs_holding_idx
  on public.cardapioweb_installs (holding_id);
create index if not exists cardapioweb_installs_unit_idx
  on public.cardapioweb_installs (unit_id);

alter table public.cardapioweb_installs enable row level security;

comment on table public.cardapioweb_installs is
  'Lojas conectadas ao Cardápio Web via OAuth. Tokens ficam no Vault; aqui só os ids dos segredos. Acesso só via service_role.';

-- 2) Estado do fluxo OAuth (efêmero) ----------------------------------------
-- O code_verifier do PKCE vive aqui por ~10 min. É de uso único e inútil
-- sem o authorization_code, por isso fica em texto puro mesmo — o que
-- protege de verdade é o TTL curto + a limpeza abaixo.
create table if not exists public.cardapioweb_oauth_states (
  state         text primary key,
  holding_id    uuid not null references public.holdings(id) on delete cascade,
  unit_id       uuid references public.units(id),
  ambiente      text not null check (ambiente in ('sandbox', 'producao')),
  code_verifier text not null,
  created_by    uuid references auth.users(id),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists cardapioweb_oauth_states_expires_idx
  on public.cardapioweb_oauth_states (expires_at);

alter table public.cardapioweb_oauth_states enable row level security;

-- 3) Pedidos (cabeçalho + fila do detalhamento) -----------------------------
create table if not exists public.cardapioweb_pedidos (
  id                   uuid primary key default gen_random_uuid(),
  install_id           uuid not null references public.cardapioweb_installs(id) on delete cascade,
  -- Desnormalizado do install pra as queries de relatório não precisarem join.
  unit_id              uuid references public.units(id),
  order_id             text not null,
  display_id           text,
  external_order_id    text,
  external_display_id  text,

  status               text,
  order_type           text,   -- delivery | takeout | onsite | closed_table
  order_timing         text,   -- immediate | scheduled
  -- ONDE o pedido nasceu. Vale ouro: 'ifood' aqui significa que o pedido do
  -- iFood chega por essa API COM os itens — coisa que a API do iFood não dá.
  sales_channel        text,   -- catalog | store_front_catalog | portal | whatsapp_extension | ifood
  delivered_by         text,   -- merchant | ifood | ifood_shipping | foody_delivery | food99 | keeta | aiqfome
  customer_origin      text,

  customer_cw_id       text,
  customer_nome        text,
  customer_telefone    text,

  cancellation_reason  text,
  observation          text,

  delivery_fee         numeric(12,2),
  service_fee          numeric(12,2),
  additional_fee       numeric(12,2),
  total                numeric(12,2),

  -- discounts[] resumido. `sponsorship` diz quem bancou: merchant | ifood.
  desconto_total       numeric(12,2),
  desconto_loja        numeric(12,2),
  desconto_plataforma  numeric(12,2),

  -- payments[] resumido (o array inteiro fica em `pagamentos`).
  forma_pagamento      text,
  pagamento_tipo       text,   -- online | offline

  endereco             jsonb,
  pagamentos           jsonb,
  descontos            jsonb,

  criado_em            timestamptz,
  atualizado_em        timestamptz,
  ref_year             int,
  ref_month            int,

  -- Fila do N+1: false = só temos o LiteOrder, falta GET /orders/{id}.
  detalhe_ok           boolean not null default false,
  detalhe_erro         text,
  detalhe_tentativas   int not null default 0,
  raw                  jsonb,

  synced_at            timestamptz not null default now()
);

create unique index if not exists cardapioweb_pedidos_uk
  on public.cardapioweb_pedidos (install_id, order_id);
-- Índice do job de detalhamento: pega os pendentes mais antigos primeiro.
create index if not exists cardapioweb_pedidos_pendentes_idx
  on public.cardapioweb_pedidos (install_id, criado_em)
  where detalhe_ok = false;
create index if not exists cardapioweb_pedidos_unit_periodo_idx
  on public.cardapioweb_pedidos (unit_id, ref_year, ref_month);
create index if not exists cardapioweb_pedidos_canal_idx
  on public.cardapioweb_pedidos (unit_id, sales_channel);

alter table public.cardapioweb_pedidos enable row level security;

-- 4) Itens do pedido ---------------------------------------------------------
create table if not exists public.cardapioweb_pedido_itens (
  id             bigint generated always as identity primary key,
  pedido_id      uuid not null references public.cardapioweb_pedidos(id) on delete cascade,
  unit_id        uuid references public.units(id),
  order_item_id  text,
  item_id        text,
  -- Código do PDV: é a ponte pra ficha técnica / CMV por produto.
  external_code  text,
  nome           text,
  kind           text,   -- regular_item | combo
  status         text,
  quantidade     numeric(12,3),
  preco_unitario numeric(12,2),
  preco_total    numeric(12,2),
  observacao     text
);

create index if not exists cardapioweb_pedido_itens_pedido_idx
  on public.cardapioweb_pedido_itens (pedido_id);
create index if not exists cardapioweb_pedido_itens_nome_idx
  on public.cardapioweb_pedido_itens (unit_id, nome);

alter table public.cardapioweb_pedido_itens enable row level security;

-- 5) Complementos do item ----------------------------------------------------
-- Tabela própria (e não jsonb) porque "top complementos" é relatório que a
-- gente já entrega nas outras plataformas — agregar em SQL fica trivial.
create table if not exists public.cardapioweb_pedido_opcoes (
  id                bigint generated always as identity primary key,
  item_id_fk        bigint not null references public.cardapioweb_pedido_itens(id) on delete cascade,
  pedido_id         uuid not null references public.cardapioweb_pedidos(id) on delete cascade,
  unit_id           uuid references public.units(id),
  option_id         text,
  external_code     text,
  nome              text,
  grupo_id          text,
  grupo_nome        text,
  quantidade        numeric(12,3),
  preco_unitario    numeric(12,2)
);

create index if not exists cardapioweb_pedido_opcoes_item_idx
  on public.cardapioweb_pedido_opcoes (item_id_fk);
create index if not exists cardapioweb_pedido_opcoes_nome_idx
  on public.cardapioweb_pedido_opcoes (unit_id, nome);

alter table public.cardapioweb_pedido_opcoes enable row level security;

-- 6) Clientes ----------------------------------------------------------------
-- Dado que NENHUMA outra plataforma nossa entrega: base de clientes com
-- fidelidade e cashback. Não vem endereço nem histórico — a ligação com o
-- pedido é por customer_cw_id.
create table if not exists public.cardapioweb_clientes (
  id                        uuid primary key default gen_random_uuid(),
  install_id                uuid not null references public.cardapioweb_installs(id) on delete cascade,
  unit_id                   uuid references public.units(id),
  customer_id               text not null,
  nome                      text,
  email                     text,
  telefone                  text,
  ddi                       text,
  nascimento                date,
  genero                    text,   -- female | male | non-binary | other
  loyalty_points            numeric(12,2),
  loyalty_points_expires_at timestamptz,
  cashback_balance          numeric(12,2),
  cashback_expires_at       timestamptz,
  notifications_enabled     boolean,
  criado_em                 timestamptz,
  synced_at                 timestamptz not null default now()
);

create unique index if not exists cardapioweb_clientes_uk
  on public.cardapioweb_clientes (install_id, customer_id);
create index if not exists cardapioweb_clientes_unit_idx
  on public.cardapioweb_clientes (unit_id);

alter table public.cardapioweb_clientes enable row level security;

-- 7) Catálogo (snapshot) -----------------------------------------------------
create table if not exists public.cardapioweb_catalogo_itens (
  id             uuid primary key default gen_random_uuid(),
  install_id     uuid not null references public.cardapioweb_installs(id) on delete cascade,
  unit_id        uuid references public.units(id),
  item_id        text not null,
  external_code  text,
  categoria_id   text,
  categoria_nome text,
  nome           text,
  descricao      text,
  preco          numeric(12,2),
  ativo          boolean,
  synced_at      timestamptz not null default now()
);

create unique index if not exists cardapioweb_catalogo_itens_uk
  on public.cardapioweb_catalogo_itens (install_id, item_id);

alter table public.cardapioweb_catalogo_itens enable row level security;

-- 8) Estado da sincronização -------------------------------------------------
-- O backfill anda PRA TRÁS em janelas (o /orders/history exige start_date e
-- end_date e aceita no máximo 6 meses por consulta), então guardamos até onde
-- já voltamos. O incremental anda pra frente a partir de `historico_ate`.
create table if not exists public.cardapioweb_sync_state (
  install_id           uuid primary key references public.cardapioweb_installs(id) on delete cascade,
  backfill_alvo        date,        -- até onde queremos voltar
  backfill_cursor      date,        -- até onde já voltamos
  backfill_concluido   boolean not null default false,
  historico_ate        timestamptz, -- fim da última janela importada
  ultimo_run_at        timestamptz,
  ultimo_erro          text,
  updated_at           timestamptz not null default now()
);

alter table public.cardapioweb_sync_state enable row level security;

-- 9) Log das chamadas --------------------------------------------------------
create table if not exists public.cardapioweb_api_logs (
  id                  bigint generated always as identity primary key,
  install_id          uuid references public.cardapioweb_installs(id) on delete set null,
  endpoint            text not null,
  method              text not null,
  url                 text,
  request_body        jsonb,
  response_status     int,
  response_body       text,
  response_size_bytes int,
  duration_ms         int,
  retry_count         int not null default 0,
  error_message       text,
  ambiente            text,
  created_at          timestamptz not null default now()
);

create index if not exists cardapioweb_api_logs_created_idx
  on public.cardapioweb_api_logs (created_at desc);
create index if not exists cardapioweb_api_logs_install_idx
  on public.cardapioweb_api_logs (install_id, created_at desc);

alter table public.cardapioweb_api_logs enable row level security;

-- ── Tokens no Vault ─────────────────────────────────────────────────────────
-- O schema `vault` não é exposto pelo PostgREST, então o acesso vai por estas
-- duas funções SECURITY DEFINER. Assim o token nunca trafega numa query
-- genérica e o ponto de acesso fica concentrado (e auditável) aqui.

create or replace function public.cardapioweb_salvar_tokens(
  p_install_id uuid,
  p_access     text,
  p_refresh    text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_access_id  uuid;
  v_refresh_id uuid;
begin
  select access_secret_id, refresh_secret_id
    into v_access_id, v_refresh_id
    from public.cardapioweb_installs
   where id = p_install_id;

  if not found then
    raise exception 'Instalação % não encontrada', p_install_id;
  end if;

  -- Access token
  if v_access_id is null then
    v_access_id := vault.create_secret(
      p_access,
      'cw_access_' || p_install_id::text,
      'Cardápio Web · access_token'
    );
  else
    perform vault.update_secret(v_access_id, p_access);
  end if;

  -- Refresh token (só reescreve quando vier — o refresh pode não rotacionar)
  if p_refresh is not null then
    if v_refresh_id is null then
      v_refresh_id := vault.create_secret(
        p_refresh,
        'cw_refresh_' || p_install_id::text,
        'Cardápio Web · refresh_token'
      );
    else
      perform vault.update_secret(v_refresh_id, p_refresh);
    end if;
  end if;

  update public.cardapioweb_installs
     set access_secret_id  = v_access_id,
         refresh_secret_id = coalesce(v_refresh_id, refresh_secret_id),
         token_expires_at  = p_expires_at,
         updated_at        = now()
   where id = p_install_id;
end;
$$;

create or replace function public.cardapioweb_ler_tokens(p_install_id uuid)
returns table (
  access_token  text,
  refresh_token text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
  select
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = i.access_secret_id),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = i.refresh_secret_id),
    i.token_expires_at
  from public.cardapioweb_installs i
  where i.id = p_install_id;
end;
$$;

-- Fail-closed: essas funções leem segredo em claro. Só o service_role chama.
revoke execute on function public.cardapioweb_salvar_tokens(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.cardapioweb_ler_tokens(uuid) from public, anon, authenticated;

comment on function public.cardapioweb_ler_tokens(uuid) is
  'Devolve os tokens do Cardápio Web em claro (Vault). Restrita ao service_role.';
