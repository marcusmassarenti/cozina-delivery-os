--------------------------------------------------------------------
-- 0073_conta_cadastro.sql
-- Dados cadastrais / de Nota Fiscal da conta (holding). Fonte única no
-- nosso banco: a tela "Minha conta > Informações" grava aqui e sincroniza
-- com o cliente do Asaas (asaasUpdateCustomer). Antes esses dados só
-- existiam no Asaas.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists doc_cpf_cnpj   text,
  add column if not exists account_type   text check (account_type in ('PF', 'PJ')),
  add column if not exists razao_social    text,
  add column if not exists nf_cep         text,
  add column if not exists nf_logradouro  text,
  add column if not exists nf_numero      text,
  add column if not exists nf_complemento text,
  add column if not exists nf_bairro      text,
  add column if not exists nf_cidade      text,
  add column if not exists nf_uf          text,
  add column if not exists nf_telefone    text,
  add column if not exists nf_email       text;

comment on column public.holdings.doc_cpf_cnpj is
  'CPF ou CNPJ do titular da conta (só dígitos). Usado na cobrança/NF.';
comment on column public.holdings.razao_social is
  'Razão social / nome do titular pra Nota Fiscal (pode diferir de name).';
