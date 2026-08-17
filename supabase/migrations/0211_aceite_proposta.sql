-- Aceite eletrônico da proposta, DENTRO do próprio sistema.
--
-- POR QUE NÃO UMA PLATAFORMA DE ASSINATURA: ZapSign, Autentique, Clicksign e
-- D4Sign vendem justamente o acesso via API — o plano grátis serve pra assinar
-- na mão, no site deles. Pagar mensalidade fixa pra um punhado de propostas por
-- mês não se paga (Marcus, 16/08/26).
--
-- O que a lei pede pra valer entre duas empresas privadas é bem menos do que
-- essas plataformas vendem: a Lei 14.063/2020 admite a assinatura eletrônica
-- SIMPLES quando ela identifica o signatário e anexa dados que permitam
-- verificar a integridade do documento. Certificado ICP-Brasil só é exigido
-- quando a lei impõe forma específica — não é o caso de um contrato de SaaS.
--
-- Então é isso que as colunas abaixo guardam: QUEM aceitou (nome, CPF, cargo,
-- e-mail), DE ONDE (IP e navegador), QUANDO (`assinada_em`, que já existia) e
-- O QUÊ (o hash do documento + o retrato dos textos do modelo).
alter table public.propostas
  -- Link público da proposta. É um SEGREDO, não o id: o id aparece na URL do
  -- painel e é sequencialmente descobrível a partir de outra proposta — quem
  -- adivinhasse um id leria preço negociado de outro cliente. 32 bytes
  -- aleatórios, gerados só quando o link é pedido.
  add column if not exists token_publico text,

  -- ⚠️ O RETRATO DOS TEXTOS DO MODELO, congelado no aceite.
  --
  -- `dados` já era retrato, mas "Quem somos", os blocos, o escopo item a item e
  -- o termo de aceite vinham de `propostas_modelo`, que é GLOBAL e editável.
  -- Ou seja: editar o modelo reescrevia o escopo de todas as propostas já
  -- aceitas — exatamente o que o comentário da 0202 proíbe pra `dados`.
  -- Depois de aceita, a proposta lê daqui e para de olhar o modelo.
  add column if not exists modelo_snapshot jsonb,

  -- Quem assinou. `signatario_nome`/`signatario_email` já existiam da 0202.
  add column if not exists signatario_cpf text,
  add column if not exists signatario_cargo text,

  -- A prova. IP e navegador do momento do clique.
  add column if not exists aceite_ip text,
  add column if not exists aceite_user_agent text,

  -- SHA-256 do documento aceito (número + dados + textos do modelo, em JSON
  -- canônico). É o que responde "o PDF que você me mostrou é o mesmo que eu
  -- aceitei?" sem depender de guardar o arquivo.
  add column if not exists aceite_hash text,

  -- O outro lado do botão: recusar também é resposta, e sem isso a proposta
  -- fica "enviada" pra sempre esperando um e-mail que não vem.
  add column if not exists recusada_em timestamptz,
  add column if not exists recusa_motivo text;

-- Único e parcial: proposta sem link não conflita com as outras sem link.
create unique index if not exists propostas_token_idx
  on public.propostas (token_publico)
  where token_publico is not null;

comment on column public.propostas.token_publico is
  'Segredo do link público /proposta/<token>. Nunca o id: o id vaza pelo painel e é descobrível.';
comment on column public.propostas.aceite_hash is
  'SHA-256 do documento aceito (JSON canônico de numero+dados+modelo). Prova de integridade — Lei 14.063/2020, art. 4º, I.';
comment on column public.propostas.modelo_snapshot is
  'Textos do modelo congelados no aceite. Proposta aceita NUNCA volta a ler propostas_modelo.';
