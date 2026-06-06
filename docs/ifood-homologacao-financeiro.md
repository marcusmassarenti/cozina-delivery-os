# Homologação iFood — Módulo Financeiro (Conciliação)

Respostas prontas pro formulário/reunião de homologação. Tudo aqui é sobre o
sistema real (Cozina Delivery OS), não promessa.

## Identificação
- **App:** Cozina Delivery OS · **Tipo:** Centralizado
- **clientId:** `efdda661-658e-4d38-a084-c5dd5a8f6016` (secret no cofre, fora do repo)
- **Módulos:** Financial + Merchant
- **Ticket de homologação:** #28413618 (aberto 06/06/2026, "Em análise")
- **Loja de teste:** LAB OF CHANGE LTDA — 3879106
- **Status:** auth (client_credentials) implementada e validada contra o endpoint
  real; aguardando ativação das permissões de teste pra prosseguir com o módulo
  Financeiro.

---

## 1. Abordagem de implementação das APIs

- **Autenticação:** modelo CENTRALIZADO, `grantType=client_credentials` com um
  único par clientId/clientSecret (em env var server-only, nunca no banco nem no
  client). Token (bearer) cacheado em memória no servidor e renovado por demanda,
  com margem de 5 min antes do `expiresIn`. (`src/lib/ifood/auth.ts`)
- **Financeiro:** job diário (cron Vercel, D-1) consumindo a **Conciliação On
  Demand**: solicita a geração do arquivo, consulta o status, baixa o CSV `.gz`
  (delimitador `;`), descompacta (`gunzip`) e parseia. Usamos a API **Financial
  Events** com o campo `impacto_no_repasse` pra separar o que entra no repasse
  líquido do que é só informativo.
- **Merchant:** usado pra mapear cada loja da rede (`unit_id ↔ merchant_id`).
- **Ambiente de teste:** chamadas com o header `x-request-homologation: true`.

## 2. Armazenamento e tratamento de dados financeiros

- **Banco:** PostgreSQL (Supabase). Lançamentos financeiros gravados em
  `ifood_financeiro_lancamentos` (por loja, competência, com natureza/valor).
- **Idempotência / dedupe:** chave estável por lançamento (settlement/event id ou
  unique da linha) — reprocessar o mesmo período NÃO duplica.
- **Segurança:** credenciais/token nunca persistidos no banco — só env var
  (server-only). RLS habilitado; acesso aos dados só pelo client de service-role
  no servidor. Nada sensível vai pro front.
- **Precisão:** valores tratados em 2 casas; CSV com separador `;` parseado com
  cuidado de encoding/decimal.

## 3. Interface e apresentação dos dados

- **DRE consolidado da rede** (`/financeiro`): faturamento bruto, taxas por
  plataforma, líquido, **repasse**, CMV, margem e resultado — por loja e rede,
  com **análise vertical** (% do bruto) e abertura clicável por plataforma.
- **Detalhe por loja:** mesma cascata, com VR à parte e composição do bruto.
- A conciliação alimenta o **repasse líquido** (via `impacto_no_repasse`), que
  reconcilia com o relatório de Conciliação do Portal do Parceiro (validação:
  o líquido tem que bater).

## 4. Tratamento de erros e casos extremos

- **401 (token expirado/inválido):** limpa o cache do token e reautentica.
- **Throttle de 6h da Conciliação On Demand:** reutiliza o `requestId` da última
  geração dentro da janela; não regenera à toa.
- **Link de download expirável:** sempre solicitamos um link novo a cada consulta.
- **Falha de download/parse:** log + retry com backoff; **não** sobrescreve dados
  bons já gravados (grava em transação / upsert idempotente).
- **Período vazio / loja sem movimento:** tratado como zero, sem quebrar o fluxo.

## 5. Rate limiting e resiliência

- **Cadência:** 1×/dia (D-1), respeitando o throttle de 6h — nada de polling
  agressivo.
- **Backoff exponencial** em 429/5xx, com limite de tentativas.
- **Paginação com ordenação estável** (lição já aplicada no resto do sistema —
  evita duplicar/pular linhas em respostas grandes).
- **Token cacheado** — não pedimos token a cada chamada.
- **Idempotência** ponta a ponta (dedupe), então um reprocessamento é seguro.

---

## Próximos passos
1. iFood ativar permissões de teste (via este ticket) → re-testar o token.
2. Construir o client da Conciliação On Demand validando no ambiente de teste.
3. Reunião de homologação → demonstrar a implementação com dados de teste.
4. Aprovação → habilitar nas lojas de produção. Import manual segue como fallback.
