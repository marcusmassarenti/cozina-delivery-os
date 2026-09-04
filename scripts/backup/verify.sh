#!/usr/bin/env bash
#
# Baixa o último backup, exibe checksum + tamanho e (opcional) testa
# restore num Postgres descartável em Docker.
#
# Uso:
#   ./verify.sh                   # só checksum + tamanho
#   ./verify.sh --restore         # também sobe Postgres em Docker e restaura
#
# Exit:
#   0 dump existe, tamanho > 1 KB, (se --restore) restore deu certo
#   1 algo deu errado
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

log() { printf '[verify %s] %s\n' "$(date -u +'%H:%M:%SZ')" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }

DO_RESTORE=0
[[ "${1:-}" == "--restore" ]] && DO_RESTORE=1

for bin in aws gunzip shasum; do
  command -v "$bin" >/dev/null || die "Falta binário: $bin"
done
[[ "$DO_RESTORE" == "1" ]] && { command -v docker >/dev/null || die "--restore precisa de docker"; }

: "${R2_ACCOUNT_ID:?}"; : "${R2_BUCKET:?}"
: "${R2_ACCESS_KEY_ID:?}"; : "${R2_SECRET_ACCESS_KEY:?}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
BACKUP_PREFIX="${BACKUP_PREFIX:-cozina}"

LATEST="$(aws s3api list-objects-v2 \
            --bucket "$R2_BUCKET" \
            --prefix "${BACKUP_PREFIX}/daily/" \
            --endpoint-url "$R2_ENDPOINT" \
            --query 'sort_by(Contents,&LastModified)[-1].Key' \
            --output text)"
[[ -z "$LATEST" || "$LATEST" == "None" ]] && die "Nada em daily/"
log "latest: $LATEST"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
LOCAL_FILE="$WORKDIR/$(basename "$LATEST")"

aws s3 cp "s3://${R2_BUCKET}/${LATEST}" "$LOCAL_FILE" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

BYTES="$(wc -c < "$LOCAL_FILE")"
SHA="$(shasum -a 256 "$LOCAL_FILE" | awk '{print $1}')"
log "tamanho: $BYTES bytes"
log "sha256 : $SHA"

(( BYTES > 1024 )) || die "tamanho suspeito"

# Confere se é gzip válido
gunzip -t "$LOCAL_FILE" 2>/dev/null || die "arquivo não é gzip válido"
log "gzip OK"

# Confere se descomprimido começa com algo que parece pg_dump
gunzip -c "$LOCAL_FILE" | head -5 | grep -qE "^(--|SET )" || die "conteúdo não parece dump SQL"
log "conteúdo parece dump SQL válido"

if [[ "$DO_RESTORE" == "0" ]]; then
  log "OK (use --restore pra testar restore real)."
  exit 0
fi

# ----- restore test em Postgres descartável -----
CONTAINER="cozina-verify-pg-$$"
PORT="$(( ( RANDOM % 1000 ) + 55432 ))"
log "subindo postgres descartável em :${PORT} ($CONTAINER)"
docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_DB=verify \
  -p "${PORT}:5432" \
  postgres:16-alpine >/dev/null

cleanup_pg() { docker stop "$CONTAINER" >/dev/null 2>&1 || true; }
trap 'cleanup_pg; rm -rf "$WORKDIR"' EXIT

log "esperando postgres aceitar conexões..."
for _ in {1..30}; do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

log "restaurando..."
gunzip -c "$LOCAL_FILE" | \
  docker exec -i "$CONTAINER" psql -U postgres -d verify -v ON_ERROR_STOP=1 >/dev/null

# Sanity check: deve ter as tabelas principais
TABLES="$(docker exec "$CONTAINER" psql -U postgres -d verify -tAc \
  "select count(*) from pg_tables where schemaname='public'")"
log "tabelas em public: $TABLES"
(( TABLES > 0 )) || die "restore não criou nenhuma tabela"

log "OK. Restore-test passou."
