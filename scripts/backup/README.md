# Backup offsite — Supabase → Cloudflare R2

Camada extra de proteção independente da Supabase. Dump diário do schema
`public`, comprimido, enviado pro R2 com rolling retention. Falha dispara
email via Resend.

> **Por que existe**: o Free tier da Supabase **não dá PITR** e só retém
> 1 backup diário. Sem essa camada, qualquer incidente (você, eles, bug)
> = dados embora pra sempre.

---

## 1. Pré-requisitos (uma vez)

### 1.1 Binários no Mac
```bash
brew install postgresql@16 awscli jq
# (postgres@16 só pelo pg_dump; não precisa rodar o servidor)
```

### 1.2 Bucket no Cloudflare R2
1. Dashboard Cloudflare → **R2** → **Create bucket** → nome `cozina-backups`,
   location `Automatic`.
2. Aba **Settings** do bucket → confirme que **Public access** está
   desligado (default).
3. Sidebar **R2** → **Manage R2 API Tokens** → **Create API token**:
   - Permission: **Object Read & Write**
   - Specify bucket: `cozina-backups`
   - TTL: forever (ou rotacione a cada 90d se quiser ser rígido)
   - Anote `Access Key ID` e `Secret Access Key` (só aparece uma vez)
4. Anote o **Account ID** (canto superior direito do dashboard).

### 1.3 Resend (alerta)
1. resend.com → criar conta gratuita.
2. **API Keys** → **Create API Key** com permissão `Sending access`.
3. Pra mandar email de um domínio seu, **Domains** → adicione e configure
   DNS (DKIM + SPF). Pra começar testando, dá pra usar
   `onboarding@resend.dev` como `ALERT_EMAIL_FROM`.

### 1.4 Connection string do Supabase
Dashboard Supabase → projeto → **Settings → Database** → seção
**Connection string** → aba **URI** → copie. Pra rodar do seu Mac, use
**Direct connection** (porta 5432). Pra CI, prefira a **Pooled
connection** (porta 6543, modo `transaction`).

### 1.5 Preencher `.env`
```bash
cp scripts/backup/.env.example scripts/backup/.env
$EDITOR scripts/backup/.env
```

---

## 2. Primeira execução manual

```bash
chmod +x scripts/backup/*.sh
./scripts/backup/backup.sh
```

Esperado:
- Cria dump local em `/tmp/...sql.gz`, mostra tamanho e sha256.
- Sobe pra `s3://cozina-backups/cozina/daily/2026-MM-DD.sql.gz`.
- (Se for domingo, sobe também em `weekly/`. Se for dia 1, em `monthly/`.)
- Aplica retention.
- Não envia email (só envia em falha).

Pra forçar um teste de alerta: edite `.env` com `DATABASE_URL` inválida e
rode — você deve receber o email do Resend.

---

## 3. Verificar o backup

```bash
# Só metadados (checksum, tamanho, gzip válido, parece dump SQL)
./scripts/backup/verify.sh

# Teste de restore real num Postgres descartável em Docker
./scripts/backup/verify.sh --restore
```

`--restore` sobe um `postgres:16-alpine` em container temporário,
restaura o último dump, conta as tabelas em `public`, e derruba o
container. Leva ~30s.

**Rode isso pelo menos 1x por mês.** Backup que ninguém testou não é
backup.

---

## 4. Restore real (em incidente)

```bash
# Restaura o último em um banco LOCAL de staging (ou Supabase staging)
./scripts/backup/restore.sh latest 'postgres://postgres:senha@localhost:5432/cozina_dev'

# Ou uma chave específica
./scripts/backup/restore.sh cozina/daily/2026-05-30.sql.gz 'postgres://...'
```

O script pede confirmação digitando `RESTAURAR`. **Nunca aponte pro
banco de produção sem antes ter testado em staging** — o dump usa schema
`public` e tabelas com `--clean` implícito via convenção do app não está
ligado, então restaurar em cima de dados existentes vai dar conflito de
PK.

Procedimento de DR completo em `docs/dr-runbook.md` *(a fazer; me pede
quando quiser)*.

---

## 5. Automatizar (escolha uma)

### Opção A — Local cron no Mac (mais simples, depende do Mac estar ligado)

```bash
crontab -e
```

Cole:
```
# Backup Cozina — diário às 03:00 BRT (= 06:00 UTC)
0 6 * * * /bin/bash -lc 'cd /caminho/absoluto/cozina-delivery-os && ./scripts/backup/backup.sh >> /tmp/cozina-backup.log 2>&1'
```

Limitação: se o Mac estiver dormindo ou desligado às 03h, não roda.
macOS por padrão **não acorda pra cron**. Solução: usar `pmset` pra
agendar wake, ou ir pra opção B.

### Opção B — GitHub Actions (recomendado, roda na nuvem) ⭐

Workflow já pronto em `.github/workflows/backup.yml`. Pra ativar:

1. Repo no GitHub → **Settings → Secrets and variables → Actions** →
   adicione cada chave do `.env` como secret:
   - `DATABASE_URL`
   - `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`
2. Pra `DATABASE_URL` no CI, **use a Pooled Connection** (porta 6543) —
   conexões diretas saindo de Actions são mais flakey.
3. Commite e mergeie o workflow. Ele roda automaticamente todo dia às
   06:00 UTC.
4. Pode disparar manualmente em **Actions → Backup Supabase → Run
   workflow** pra testar.

Vantagens: roda sempre, mesmo com seu Mac desligado; tem histórico de
execução; gratuito dentro dos 2000min/mês de Actions.

---

## 6. Custo estimado

| Item | Custo |
|---|---|
| R2 storage (~50 MB × 14 backups vivos) | grátis (10 GB free tier) |
| R2 egress (pra restore) | grátis (Cloudflare zera egress) |
| Resend | grátis (100 emails/dia free) |
| GitHub Actions | grátis (~5min/dia, longe do limite) |
| **Total** | **R$ 0,00** |

---

## 7. Rotação de credenciais

A cada 90 dias (ou imediatamente se suspeitar de vazamento):

- **R2 API token**: gere novo no dashboard, atualize `.env` e GH Secrets,
  delete o antigo.
- **Supabase**: Settings → Database → Reset database password. Atualize
  `DATABASE_URL` em `.env`, GH Secrets, e nas env vars da Vercel.
- **Resend**: API Keys → regenerate.

Sempre atualize os 3 lugares se aplicável: `.env` local, GH Secrets,
Vercel env vars.
