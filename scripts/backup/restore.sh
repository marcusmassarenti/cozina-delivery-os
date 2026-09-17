#!/usr/bin/env bash
#
# Restaura um dump do R2 em um Postgres alvo.
#
# Uso:
#   ./restore.sh <chave-no-r2|latest> <target-database-url>
#
# Exemplos:
#   ./restore.sh latest postgres://user:pass@localhost:5432/cozina_test
#   ./restore.sh cozina/daily/2026-05-30.sql.gz postgres://...
#
# Por segurança, NÃO restaura em cima da URL de produção sem confirmação
# explícita. Idealmente aponte pra um banco vazio (local ou Supabase staging).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

log() { printf '[restore %s] %s\n' "$(date -u +'%H:%M:%SZ')" "$*" >&2; }
die() { log "ERRO: $*"; exit "${2:-1}"; }

[[ $# -eq 2 ]] || die "Uso: $0 <chave-r2|latest> <target-database-url>"

SOURCE="$1"
TARGET_URL="$2"

for bin in aws psql gunzip; do
  command -v "$bin" >/dev/null || die "Falta binário: $bin"
done

: "${R2_ACCOUNT_ID:?}"; : "${R2_BUCKET:?}"
: "${R2_ACCESS_KEY_ID:?}"; : "${R2_SECRET_ACCESS_KEY:?}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
BACKUP_PREFIX="${BACKUP_PREFIX:-cozina}"

# Resolve "latest" → última chave em daily/
if [[ "$SOURCE" == "latest" ]]; then
  SOURCE="$(aws s3api list-objects-v2 \
              --bucket "$R2_BUCKET" \
              --prefix "${BACKUP_PREFIX}/daily/" \
              --endpoint-url "$R2_ENDPOINT" \
              --query 'sort_by(Contents,&LastModified)[-1].Key' \
              --output text)"
  [[ -z "$SOURCE" || "$SOURCE" == "None" ]] && die "Nada em daily/"
  log "latest = $SOURCE"
fi

# Confirmação dupla pra evitar restore acidental em prod
TARGET_HOST="$(echo "$TARGET_URL" | sed -E 's|.+@([^/:]+).*|\1|')"
log "Vai RESTAURAR em: $TARGET_HOST"
read -rp "Tem CERTEZA? Digite 'RESTAURAR' pra continuar: " confirm
[[ "$confirm" == "RESTAURAR" ]] || die "Cancelado."

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
LOCAL_FILE="$WORKDIR/$(basename "$SOURCE")"

log "Download s3://${R2_BUCKET}/${SOURCE}"
aws s3 cp "s3://${R2_BUCKET}/${SOURCE}" "$LOCAL_FILE" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

log "Tamanho: $(wc -c < "$LOCAL_FILE") bytes  sha256: $(shasum -a 256 "$LOCAL_FILE" | awk '{print $1}')"

log "Restaurando em $TARGET_HOST..."
gunzip -c "$LOCAL_FILE" | psql "$TARGET_URL" -v ON_ERROR_STOP=1

log "OK."
