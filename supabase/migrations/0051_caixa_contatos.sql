--------------------------------------------------------------------
-- 0051_caixa_contatos.sql
--
-- Cadastros de Empresas & Pessoas (clientes, fornecedores, PF) pra
-- vincular nos lançamentos do caixa. Escopo por holding (cliente).
--------------------------------------------------------------------

create table public.fin_contacts (
  id                 uuid primary key default uuid_generate_v4(),
  holding_id         uuid not null references public.holdings(id) on delete cascade,
  person_type        text not null default 'pj' check (person_type in ('pj', 'pf')),
  name               text not null,        -- nome / nome fantasia
  legal_name         text,                 -- razão social
  doc                text,                 -- CNPJ ou CPF (só dígitos)
  contact_type       text not null default 'cliente'
                     check (contact_type in ('cliente', 'fornecedor', 'ambos', 'colaborador')),
  payment_term       text,                 -- prazo de pagamento (ex: "28 dias")
  state_registration text,                 -- inscrição estadual
  phone              text,
  email              text,
  -- endereço
  cep                text,
  logradouro         text,
  numero             text,
  bairro             text,
  cidade             text,
  uf                 text,
  complemento        text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index fin_contacts_holding_idx on public.fin_contacts (holding_id);
create index fin_contacts_name_idx on public.fin_contacts (holding_id, name);

alter table public.fin_contacts enable row level security;
create policy "fin_contacts_select" on public.fin_contacts for select
  using (public.has_holding_access(holding_id));

comment on table public.fin_contacts is 'Empresas & Pessoas (clientes/fornecedores/PF) pra vincular nos lançamentos.';
