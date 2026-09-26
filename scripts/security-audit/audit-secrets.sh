#!/usr/bin/env bash
#
# Varredura local por segredos hardcoded e arquivos sensíveis.
# Rode na raiz do repo: ./scripts/security-audit/audit-secrets.sh
#
# Cobre:
#   - .env* trackeados no git
#   - .env* presentes na working dir sem estar no .gitignore
#   - chaves/keys conhecidas em código (Supabase service_role JWT, AWS,
#     OpenAI, Stripe, Resend, JWT genérico, PEM)
#   - segredos no histórico do git (não só HEAD)
#
# Exit 0 = nada suspeito. Exit 1 = encontrou algo pra olhar.
#
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || {
  echo "Rode dentro de um repo git."; exit 2;
}

YELLOW=$'\033[33m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RESET=$'\033[0m'
findings=0

section() { printf '\n%s═══ %s %s\n' "$DIM" "$1" "$RESET"; }
ok()      { printf '  %s✓%s %s\n'   "$GREEN" "$RESET" "$1"; }
warn()    { printf '  %s!%s %s\n'   "$YELLOW" "$RESET" "$1"; findings=$((findings+1)); }
bad()     { printf '  %s✗%s %s\n'   "$RED"   "$RESET" "$1"; findings=$((findings+1)); }

# ────────────────────────────────────────────────────────────────
section "1. .env* trackeados no git"
tracked_env="$(git ls-files | grep -E '(^|/)\.env($|\.)' || true)"
if [[ -z "$tracked_env" ]]; then
  ok "nenhum .env trackeado"
else
  while IFS= read -r f; do bad "trackeado: $f  (precisa: git rm --cached $f)"; done <<< "$tracked_env"
fi

# ────────────────────────────────────────────────────────────────
section "2. .env* no histórico (mesmo se removidos)"
hist_env="$(git log --all --diff-filter=A --name-only --pretty=format: 2>/dev/null \
  | grep -E '(^|/)\.env($|\.)' | sort -u || true)"
if [[ -z "$hist_env" ]]; then
  ok "histórico limpo"
else
  while IFS= read -r f; do
    warn "já existiu no histórico: $f  (se vazou chave real, rotacione antes de mais nada)"
  done <<< "$hist_env"
fi

# ────────────────────────────────────────────────────────────────
section "3. .env* na working dir × .gitignore"
shopt -s nullglob
local_envs=( .env .env.* )
if [[ ${#local_envs[@]} -eq 0 ]]; then
  ok "nenhum .env local"
else
  for f in "${local_envs[@]}"; do
    if git check-ignore -q "$f" 2>/dev/null; then
      ok "$f (ignorado)"
    else
      bad "$f está na working dir mas NÃO está no .gitignore"
    fi
  done
fi
shopt -u nullglob

# ────────────────────────────────────────────────────────────────
section "4. Padrões de segredo no código (HEAD)"

# Cada padrão: descrição | regex | onde NÃO procurar
scan() {
  local label="$1" regex="$2"
  local matches
  matches="$(git grep -nIE "$regex" -- \
              ':!*.lock' ':!*-lock.json' ':!package-lock.json' \
              ':!.env*' ':!*.md' ':!scripts/security-audit/*' \
              2>/dev/null || true)"
  if [[ -z "$matches" ]]; then
    ok "$label"
  else
    bad "$label encontrado:"
    echo "$matches" | sed 's/^/      /'
  fi
}

scan "AWS Access Key (AKIA…)"          'AKIA[0-9A-Z]{16}'
scan "OpenAI key (sk-…)"               'sk-[A-Za-z0-9]{20,}'
scan "Stripe live key (sk_live_…)"     'sk_live_[A-Za-z0-9]{20,}'
scan "Resend key (re_…)"               're_[A-Za-z0-9_]{20,}'
scan "GitHub PAT (ghp_…)"              'ghp_[A-Za-z0-9]{30,}'
scan "Slack token (xox[bap]…)"         'xox[bap]-[A-Za-z0-9-]{10,}'
scan "Bloco PRIVATE KEY"               'BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY'
# JWT genérico longo (Supabase service_role tem ~200 chars)
scan "JWT longo (possível service_role)" 'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{20,}'

# ────────────────────────────────────────────────────────────────
section "5. process.env.<chave_secreta> exposto pro browser"
# Qualquer SUPABASE_SERVICE_ROLE em código tem que estar atrás de "server-only"
sr_uses="$(git grep -nE 'SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY' \
            -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null || true)"
if [[ -z "$sr_uses" ]]; then
  ok "nenhuma referência a SERVICE_ROLE_KEY (esquisito — confere se admin.ts existe)"
else
  echo "  referências a SERVICE_ROLE_KEY:"
  echo "$sr_uses" | sed 's/^/      /'
  # Para cada arquivo que usa, checar se importa "server-only"
  files="$(echo "$sr_uses" | cut -d: -f1 | sort -u)"
  while IFS= read -r f; do
    if grep -q '"server-only"' "$f" 2>/dev/null; then
      ok "$f importa \"server-only\""
    else
      bad "$f USA SERVICE_ROLE mas NÃO importa \"server-only\" — risco de vazar pro bundle do cliente"
    fi
  done <<< "$files"
fi

# Qualquer NEXT_PUBLIC_* não deve carregar segredo
np_secrets="$(git grep -nE 'NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|KEY)' \
                -- 'src/**' 2>/dev/null \
                | grep -vE 'NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_URL' || true)"
if [[ -z "$np_secrets" ]]; then
  ok "nenhum NEXT_PUBLIC_* com cara de segredo"
else
  bad "NEXT_PUBLIC_* suspeitos (vão pro bundle do browser):"
  echo "$np_secrets" | sed 's/^/      /'
fi

# ────────────────────────────────────────────────────────────────
section "Resumo"
if (( findings == 0 )); then
  printf '  %sNada suspeito.%s\n\n' "$GREEN" "$RESET"
  exit 0
else
  printf '  %s%d achados.%s Olhe item por item.\n\n' "$YELLOW" "$findings" "$RESET"
  exit 1
fi
