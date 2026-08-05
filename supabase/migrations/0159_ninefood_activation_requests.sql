--------------------------------------------------------------------
-- 0159_ninefood_activation_requests.sql
--
-- Fila de solicitações "conecta minha loja no 99 Food via API".
-- Gêmea de 0107 (iFood), pelo mesmo motivo: a conexão NÃO é self-service.
--
-- Como funciona no 99: a credencial do app é uma só (nossa) e gera um
-- auth_token POR LOJA, identificada por `app_shop_id` — um valor definido no
-- portal do 99, não por nós. Ou seja, a loja precisa ser autorizada ao nosso
-- app do lado deles antes de qualquer chamada funcionar.
--
-- Antes desta tabela não existia NENHUM caminho para o cliente pedir: as 7
-- lojas conectadas hoje entraram por `insert` escrito à mão na migration 0058.
-- Com 51 lojas cadastradas só na DG Foods, isso não escala e o cliente não
-- tinha como sequer sinalizar que quer.
--
--   pendente   → cliente pediu; ainda não falamos com o 99
--   solicitada → pedimos a autorização da loja ao 99
--   ativa      → app_shop_id autorizado e vinculado em ninefood_store_links
--   recusada   → não foi possível (ver `nota`)
--
-- ⚠️ DIFERENÇA PROPOSITAL EM RELAÇÃO AO iFOOD: não existe aqui o passo
-- "cliente confirma que aprovou no portal dele". No iFood esse passo é real e
-- documentado (o Proprietário aprova no Portal do Parceiro). No 99 ainda NÃO
-- sabemos se o lojista precisa aprovar algo — é justamente uma das perguntas
-- em aberto com eles. Inventar a etapa faria a tela pedir ao cliente uma ação
-- que talvez não exista. Quando a resposta vier, acrescenta-se a coluna.
--
-- RLS habilitada SEM policies (service_role only), padrão do projeto.
--------------------------------------------------------------------

create table if not exists public.ninefood_activation_requests (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references public.holdings(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete set null,
  cnpj         text not null,
  -- Nome ou ID da loja no painel do 99. Opcional: o cliente nem sempre sabe,
  -- e o CNPJ já basta pra achar. Quando vem, poupa ida e volta com o 99.
  loja_99      text,
  status       text not null default 'pendente'
                 check (status in ('pendente', 'solicitada', 'ativa', 'recusada')),
  -- Observação do admin (ex.: motivo da recusa) — aparece pro cliente.
  nota         text,
  requested_by uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ninefood_activation_requests_holding_idx
  on public.ninefood_activation_requests (holding_id, created_at desc);
create index if not exists ninefood_activation_requests_status_idx
  on public.ninefood_activation_requests (status)
  where status in ('pendente', 'solicitada');

alter table public.ninefood_activation_requests enable row level security;

comment on table public.ninefood_activation_requests is
  'Fila de ativação de loja 99 Food via API. O app_shop_id é definido no portal do 99, então a loja precisa ser autorizada lá antes de sincronizar. Cliente pede com CNPJ; admin trata com o 99 e atualiza o status.';
