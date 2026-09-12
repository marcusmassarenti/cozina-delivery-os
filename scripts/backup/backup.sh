#!/usr/bin/env bash
#
# Dump do schema `public` do Supabase, comprime, sobe pro Cloudflare R2
# em rolling retention (7 diários + 4 semanais + 3 mensais) e dispara
# email via Resend se algo falhar.
#
# Variáveis exigidas (ver .env.example):
#   DATABASE_URL              postgres://... do Supabase (Settings > Database > URI)
#   R2_ACCOUNT_ID             ID da conta Cloudflare (32 hex)
#   R2_BUCKET                 nome do bucket
#   R2_ACCESS_KEY_ID          token R2
#   R2_SECRET_ACCESS_KEY      token R2
#   RESEND_API_KEY            API key do Resend (re_...)
#   ALERT_EMAIL_TO            destinatário do alerta
#   ALERT_EMAIL_FROM          remetente verificado no Resend
#
# Variáveis opcionais:
#   BACKUP_PREFIX             prefixo no bucket (default: cozina)
#   DUMP_SCHEMAS              schemas a dumpar (default: public)
#
# Saídas:
#   exit 0  sucesso
#   exit 1  pré-condição faltando (env, binários)
#   exit 2  pg_dump falhou
#   exit 3  upload R2 falhou
#   exit 4  retention falhou (não-fatal, apenas avisa)
#
set -euo pipefail

# ----- carrega .env do diretório do script, se existir -----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ----- logging -----
log() { printf '[backup %s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die() { log "ERRO: $*"; exit "${2:-1}"; }

# ----- alerta por email (Resend) -----
send_alert() {
  local subject="$1"
  local body="$2"
  if [[ -z "${RESEND_API_KEY:-}" || -z "${ALERT_EMAIL_TO:-}" || -z "${ALERT_EMAIL_FROM:-}" ]]; then
    log "Sem RESEND_API_KEY/ALERT_EMAIL_*; pulando alerta."
    return 0
  fi
  log "Enviando alerta pra $ALERT_EMAIL_TO..."
  curl -sS -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc \
        --arg from "$ALERT_EMAIL_FROM" \
        --arg to   "$ALERT_EMAIL_TO" \
        --arg sub  "$subject" \
        --arg txt  "$body" \
        '{from:$from, to:[$to], subject:$sub, text:$txt}')" \
    >/dev/null || log "Falhou enviar email de alerta (mas seguindo)."
}

# trap: qualquer erro depois daqui dispara o alerta
on_error() {
  local exit_code=$?
  local line=$1
  send_alert \
    "[Cozina] Backup FALHOU ($(date -u +'%Y-%m-%d %H:%MZ'))" \
    "Script: $0
Linha:  $line
Código: $exit_code
Host:   $(hostname)

Veja os logs do job pra detalhes."
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# ----- valida dependências -----
for bin in pg_dump aws gzip jq curl; do
  command -v "$bin" >/dev/null || die "Falta binário: $bin" 1
done

# ----- valida env -----
: "${DATABASE_URL:?DATABASE_URL é obrigatório}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID é obrigatório}"
: "${R2_BUCKET:?R2_BUCKET é obrigatório}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID é obrigatório}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY é obrigatório}"

BACKUP_PREFIX="${BACKUP_PREFIX:-cozina}"
DUMP_SCHEMAS="${DUMP_SCHEMAS:-public}"

# AWS CLI fala com R2 via endpoint customizado.
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# ----- gera dump -----
TIMESTAMP="$(date -u +'%Y-%m-%dT%H%M%SZ')"
TODAY="$(date -u +'%Y-%m-%d')"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
DUMP_FILE="$WORKDIR/${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"

log "pg_dump → $DUMP_FILE (schemas: $DUMP_SCHEMAS)"
SCHEMA_FLAGS=()
IFS=',' read -ra _schemas <<< "$DUMP_SCHEMAS"
for s in "${_schemas[@]}"; do
  SCHEMA_FLAGS+=(--schema="$(echo "$s" | xargs)")
done

if ! pg_dump "$DATABASE_URL" \
      --no-owner \
      --no-privileges \
      --format=plain \
      "${SCHEMA_FLAGS[@]}" \
    | gzip -9 > "$DUMP_FILE"; then
  die "pg_dump falhou" 2
fi

DUMP_BYTES="$(wc -c < "$DUMP_FILE")"
DUMP_SHA="$(shasum -a 256 "$DUMP_FILE" | awk '{print $1}')"
log "Dump pronto: ${DUMP_BYTES} bytes  sha256=${DUMP_SHA}"

# Sanidade básica: dump menor que 1 KB provavelmente é erro silencioso.
if [[ "$DUMP_BYTES" -lt 1024 ]]; then
  die "Dump suspeitamente pequeno (${DUMP_BYTES} bytes)" 2
fi

# ----- upload(s) -----
upload() {
  local key="$1"
  log "Upload → s3://${R2_BUCKET}/${key}"
  aws s3 cp "$DUMP_FILE" "s3://${R2_BUCKET}/${key}" \
    --endpoint-url "$R2_ENDPOINT" \
    --metadata "sha256=${DUMP_SHA},source_db=supabase" \
    --only-show-errors \
    || die "upload R2 falhou ($key)" 3
}

DAILY_KEY="${BACKUP_PREFIX}/daily/${TODAY}.sql.gz"
upload "$DAILY_KEY"

# Domingo (dow=0) → também vai pra weekly/
DOW="$(date -u +%u)"     # 1=Mon … 7=Sun
DOM="$(date -u +%d)"     # 01..31
if [[ "$DOW" == "7" ]]; then
  WEEK="$(date -u +'%G-W%V')"
  upload "${BACKUP_PREFIX}/weekly/${WEEK}.sql.gz"
fi

# Dia 1 → também vai pra monthly/
if [[ "$DOM" == "01" ]]; then
  MONTH="$(date -u +'%Y-%m')"
  upload "${BACKUP_PREFIX}/monthly/${MONTH}.sql.gz"
fi

# ----- retention -----
apply_retention() {
  local prefix="$1"
  local keep="$2"
  log "Retention: ${prefix}/  manter ${keep}"
  # Lista chaves ordenadas por data de modificação, descarta as últimas $keep,
  # deleta o resto. Falhas aqui são logadas mas não derrubam o backup
  # (o backup do dia já está salvo a essa altura).
  local keys
  keys="$(aws s3api list-objects-v2 \
              --bucket "$R2_BUCKET" \
              --prefix "${BACKUP_PREFIX}/${prefix}/" \
              --endpoint-url "$R2_ENDPOINT" \
              --query 'sort_by(Contents,&LastModified)[*].Key' \
              --output text 2>/dev/null || true)"
  [[ -z "$keys" || "$keys" == "None" ]] && return 0
  local total
  total="$(echo "$keys" | tr '\t' '\n' | wc -l | tr -d ' ')"
  (( total <= keep )) && return 0
  local n_delete=$(( total - keep ))
  echo "$keys" | tr '\t' '\n' | head -n "$n_delete" | while read -r k; do
    [[ -z "$k" ]] && continue
    log "  deletando $k"
    aws s3 rm "s3://${R2_BUCKET}/${k}" --endpoint-url "$R2_ENDPOINT" --only-show-errors \
      || log "  (falhou deletar $k, seguindo)"
  done
}

apply_retention "daily"   7  || true
apply_retention "weekly"  4  || true
apply_retention "monthly" 3  || true

log "OK. Backup completo."
