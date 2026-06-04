# Checklist de segurança operacional — Cozina Delivery OS

Ajustes que **não estão no código** (são configuração de conta/painel). Faça uma
vez e revise a cada poucos meses. Marque conforme for fazendo.

> A parte de **código/banco/API já está auditada e ok** (RLS em todas as tabelas,
> escrita só por service_role, guards nas actions, API com chave hasheada, headers
> de segurança no `next.config`). Isto aqui é o complemento de console.

---

## 1. GitHub  (a conta + o repositório)

- [ ] **2FA na conta** — Foto (canto sup. dir.) → **Settings** → **Password and
      authentication** → **Two-factor authentication** → *Enable*. Use um app
      autenticador (Authy/Google Authenticator). **Guarde os códigos de
      recuperação** num lugar seguro.
- [ ] **Repositório privado** — no repo → **Settings** → **General** → role até
      **Danger Zone** → confirme *visibility = Private* (se estiver público,
      *Change visibility → Private*).
- [ ] **Secret scanning + Push protection** — repo → **Settings** → **Code
      security** (ou "Code security and analysis") → ligue **Secret scanning** e
      **Push protection** (bloqueia commit que tenha chave/senha).
- [ ] **Dependabot** — mesma tela **Code security** → ligue **Dependabot alerts**
      e **Dependabot security updates** (avisa/atualiza dependência com falha).

---

## 2. Vercel  (a conta + o projeto)

- [ ] **2FA na conta** — Avatar → **Account Settings** → **Authentication** (ou
      Security) → **Two-Factor Authentication** → *Enable*.
- [ ] **Conferir a service_role** — Projeto → **Settings** → **Environment
      Variables** → ache `SUPABASE_SERVICE_ROLE_KEY`:
  - **NÃO** pode ter o prefixo `NEXT_PUBLIC_` (com esse prefixo, ela vai pro
    navegador = vazamento total). Sem prefixo = só no servidor. ✅
  - Confirme que está marcada pra **Production** (e Preview se usar).
- [ ] **Proteger as URLs de Preview** *(opcional, recomendado)* — Projeto →
      **Settings** → **Deployment Protection** → ligue **Vercel Authentication**
      pros deploys de *Preview*, pra link de branch não ficar público. A produção
      continua aberta (é o app).

---

## 3. Supabase  (a conta + o projeto)

> **Atalho que vale ouro:** Projeto → **Advisors** → aba **Security**. O Supabase
> roda uma auditoria automática do banco e lista exatamente o que ajustar (RLS,
> senha vazada, search_path…). Resolva o que aparecer lá e está coberto.

- [ ] **MFA na sua conta** — Avatar → **Account Preferences** → **Security** →
      ative **Multi-Factor Authentication** (TOTP).
- [ ] **Proteção contra senha vazada** — Projeto → **Authentication** →
      **Policies/Configuration** (seção *Password*) → ligue **"Prevent use of
      leaked passwords"** (cruza com a base do HaveIBeenPwned) e defina um
      **tamanho mínimo de senha** (ex.: 8+).
- [ ] **Versão do Postgres** — Projeto → **Settings** → **Infrastructure** (ou
      Database) → se houver **upgrade pendente**, agende (traz patches de
      segurança). Faça fora do horário de pico.
- [ ] **Service role só onde deve** — Projeto → **Settings** → **API** → a chave
      `service_role` é *secret*. Ela só pode estar no **Vercel** e no seu
      **`.env.local`** — nunca em código client nem mandada por chat/print. Se
      desconfiar que vazou, **Reset** (rotaciona) e atualize no Vercel.

---

## 4. Higiene geral (de vez em quando)

- [ ] Revisar **quem tem acesso** ao repo/Vercel/Supabase — tirar quem saiu.
- [ ] Revisar **chaves de API** geradas em **Conexões** — desativar as que não usa.
- [ ] Revisar **usuários** em Administração → Usuários — desativar antigos.

---

*Atualizado na auditoria de segurança. Código/banco/API verificados e ok;
este arquivo é só a parte de configuração de console.*
