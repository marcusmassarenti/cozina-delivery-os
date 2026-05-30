--------------------------------------------------------------------
-- 0019_api_clients.sql
-- Chaves de API pra integrações externas (ex.: ERP Cozina Foods).
-- A API REST (/api/v1) autentica por Bearer key; guardamos só o HASH
-- (SHA-256). O texto puro da chave só existe no cliente que integra.
--------------------------------------------------------------------

create table public.api_clients (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,                    -- ex.: "ERP Cozina Foods"
  key_prefix    text not null,                    -- prefixo legível (cz_live_xxxx) pra identificar
  key_hash      text not null unique,             -- SHA-256 (hex) da chave completa
  scopes        text[] not null default '{read}', -- read / write
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index api_clients_key_hash_idx on public.api_clients(key_hash);

alter table public.api_clients enable row level security;
-- Sem policies de propósito: só o service_role (admin client no servidor)
-- toca essa tabela. A autenticação da API é feita no código (hash do
-- Bearer → lookup por key_hash).

comment on table public.api_clients is
  'Chaves de API pra integrações externas. key_hash = SHA-256 da chave; o texto puro só existe no cliente (ERP). Acesso só via service_role.';
