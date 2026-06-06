# Recuperação / Migração do Banco — Plano de Desastre

Passo a passo pra colocar o sistema de volta no ar **idêntico** se o Supabase
der problema (ou se você quiser trocar de fornecedor). Pensado pra qualquer dev
seguir no susto, sem depender de ninguém.

---

## 1. Do que o sistema é feito

| Peça | Onde mora | Recupera com |
|---|---|---|
| **Código** (o site) | GitHub + deploy Vercel | Já é independente — sobe em qualquer host |
| **Estrutura do banco** (38 tabelas, RLS, funções) | `supabase/migrations/*.sql` (no repo) | Roda os migrations num Postgres novo |
| **Dados** (as linhas) | Supabase | Backup automático + `scripts/backup-db.mjs` + dump `.sql` |
| **Login / usuários** | Supabase **Auth** | ⚠️ única peça presa no Supabase (ver Cenário B) |
| **Configuração** (URLs/chaves) | `.env.local` + Vercel env | Trocar pra apontar pro banco novo |

---

## 2. Backups que você tem (3 camadas)

1. **Automático do Supabase Pro** — diário, 7 dias de retenção. Em
   `Dashboard → Database → Backups`. Dá pra restaurar/baixar por lá.
2. **Cópia externa (JSON)** — `node scripts/backup-db.mjs` gera
   `backups/<data_hora>/*.json`. **Copie a pasta pro Google Drive.** Faça 1×/semana.
3. **Dump completo (`.sql`)** — o "restaura tudo num comando". Ver seção 3.

> Regra de ouro: tenha **pelo menos uma cópia FORA do Supabase** (Drive/pendrive).

---

## 3. Gerar o dump completo (`.sql`)

É um único arquivo que recria **estrutura + dados** em qualquer Postgres.

### 3.1. Pegar a connection string
`Supabase → Settings → Database → Connection string → URI`, modo **Session**
(porta 5432). Precisa da **senha do banco** (a que você definiu ao criar o
projeto; se esqueceu, há `Reset database password` ali mesmo).

Guarde no `.env.local` (NUNCA comitar):
```
SUPABASE_DB_URL="postgresql://postgres:[SENHA]@db.[REF].supabase.co:5432/postgres"
```

Com isso configurado, o **`node scripts/backup-db.mjs` já gera o `full-dump.sql`
automático** dentro da pasta de backup (além dos JSONs), se o `pg_dump` estiver
instalado.

### 3.2. Instalar a ferramenta (uma vez)
- **Supabase CLI (recomendado — pega até os usuários):**
  `brew install supabase/tap/supabase`
- **ou pg_dump:** `brew install libpq` e adicione ao PATH
  (`echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc`).

### 3.3. Gerar manualmente
- **Supabase CLI** (inclui o schema `auth` = usuários):
  ```
  supabase db dump --db-url "$SUPABASE_DB_URL" -f full-dump.sql
  ```
- **pg_dump** (schema `public`):
  ```
  pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -f full-dump.sql
  ```

Guarde o `full-dump.sql` no Drive junto com os JSONs.

---

## 4. Restaurar — Cenário A: outro projeto Supabase (FÁCIL, ~1h)

É o caminho recomendado se der problema: rápido e o **login volta igual**.

1. Crie um projeto novo no Supabase.
2. Restaure os dados/estrutura:
   - **Dump completo:** `psql "$NOVA_DB_URL" -f full-dump.sql`
   - **ou** rode os migrations (estrutura) + importe os dados (dump `--data-only`
     ou os JSONs).
3. **Auth:** se usou o dump do **Supabase CLI**, os usuários vêm junto (login
   idêntico). Se usou só `pg_dump` do `public`, recrie os usuários (re-convide
   pela tela de Usuários, ou importe a tabela `auth.users`).
4. Pegue as **novas chaves** (`Settings → API`: URL, anon, service_role) e
   atualize no **Vercel** (Environment Variables) + no `.env.local`.
5. Redeploy no Vercel. **Pronto — sistema idêntico.**

---

## 5. Restaurar — Cenário B: Postgres "puro" (sem Supabase)

Mais trabalhoso por causa do login. Só faça se realmente quiser sair do Supabase.

1. Suba um Postgres (Neon, AWS RDS, Railway, servidor próprio…).
2. Rode os migrations (estrutura). **Atenção:** alguns helpers de RLS usam
   `auth.uid()` (função do Supabase) — num Postgres puro isso não existe e
   precisa ser adaptado/removido.
3. Importe os dados (`psql -f full-dump.sql --data-only`, ou re-import dos JSONs).
4. **Auth — o trabalho de verdade.** O Supabase Auth não existe lá. Opções:
   - Trocar o login do app por outro (NextAuth, Clerk, Auth0…), **ou**
   - Rodar o **Supabase self-hosted** (Docker) pra manter idêntico.
5. Atualize as env vars + redeploy.

⏱️ Tempo: **~1-3 dias** (por causa do auth). Por isso, no susto, prefira o
Cenário A.

---

## 6. Checklist "dormir tranquilo"

- [x] Código no GitHub
- [x] Migrations versionadas no repo
- [ ] `backups/<data>/` recente copiado pro **Drive** (rode `node scripts/backup-db.mjs`)
- [ ] `SUPABASE_DB_URL` no `.env.local` → `full-dump.sql` gerado e guardado no Drive
- [ ] **Senha do banco** anotada em lugar seguro (cofre de senhas)
- [ ] Chaves do `.env.local` (service_role) anotadas no cofre

> Com os 3 primeiros itens você já recupera tudo. Os outros aceleram o "Cenário A".
