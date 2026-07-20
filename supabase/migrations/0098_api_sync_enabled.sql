-- Flag por holding: liga o "Sincronizar" via API (iFood/99). Pros tenants SaaS
-- que só importam relatório manual, fica desligada — assim os botões de sync e
-- a cobertura de plataformas não habilitadas somem. Por enquanto só a Cozina
-- (dona da integração por API) tem habilitado.
alter table holdings
  add column if not exists api_sync_enabled boolean not null default false;

update holdings set api_sync_enabled = true where slug = 'cozina-foods';
