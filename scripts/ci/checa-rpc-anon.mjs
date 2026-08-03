/**
 * Gate de CI: nenhuma função `security definer` pode ser executável pelo ANÔNIMO.
 *
 * Existe porque essa falha já apareceu DUAS vezes:
 *   - jul/26: 6 RPCs de financeiro abertas ao anon (migration 0083 trancou);
 *   - ago/26: outras 5, achadas por auditoria externa (migration 0151 trancou).
 *
 * A 0083 consertou as funções daquele dia e nada impediu as próximas de
 * nascerem abertas -- Postgres concede EXECUTE a PUBLIC por padrão, e no
 * Supabase o `anon` herda. Tratamos o sintoma duas vezes; isto trata a causa.
 *
 * Por que a regra é "não executável pelo ANON" e não "revogado de todo mundo":
 * funções como `has_unit_access` são `security definer` de propósito e PRECISAM
 * ser executáveis pelo logado -- é assim que a RLS avalia as políticas. Proibir
 * `authenticated` quebraria a RLS inteira.
 *
 * Lê o Security Advisor do Supabase (mesma regra que o painel usa:
 * 0028_anon_security_definer_function_executable). Sem token, AVISA e passa --
 * gate que quebra o CI de quem clona o repo sem segredo vira gate desligado.
 *
 *   SUPABASE_ACCESS_TOKEN   token pessoal (GitHub secret)
 *   SUPABASE_PROJECT_REF    ref do projeto (não é segredo: vai na URL pública)
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF

if (!TOKEN || !REF) {
  console.log(
    "⚠️  checa-rpc-anon: sem SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF — pulando.\n" +
      "    Pra ligar de verdade: adicione o token nos secrets do repositório.",
  )
  process.exit(0)
}

const REGRAS_QUE_BLOQUEIAM = new Set([
  "anon_security_definer_function_executable", // o P0 de jul e ago
  "rls_disabled_in_public",
  "security_definer_view",
  "policy_exists_rls_disabled",
])

const resp = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/advisors/security`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
)

if (!resp.ok) {
  console.error(
    `✗ checa-rpc-anon: advisor respondeu ${resp.status}. ` +
      "Falhando de propósito: não dá pra chamar de gate uma checagem que não rodou.",
  )
  process.exit(1)
}

const { lints = [] } = await resp.json()
const bloqueiam = lints.filter(
  (l) => REGRAS_QUE_BLOQUEIAM.has(l.name) && l.level === "ERROR",
)

if (bloqueiam.length === 0) {
  const avisos = lints.filter((l) => l.level !== "ERROR").length
  console.log(
    `✓ Nenhuma função security definer alcançável pelo anônimo. ` +
      `(${avisos} aviso(s) não-bloqueante(s) no advisor)`,
  )
  process.exit(0)
}

console.error(`\n✗ ${bloqueiam.length} achado(s) de segurança BLOQUEANTES:\n`)
for (const l of bloqueiam) {
  console.error(`  [${l.name}] ${l.title}`)
  console.error(`     ${l.detail?.replace(/<\/?[^>]+>/g, "") ?? ""}`)
  if (l.remediation) console.error(`     → ${l.remediation}`)
  console.error("")
}
console.error(
  "Conserto: na MESMA migration que cria a função,\n" +
    "  revoke execute on function <assinatura> from public, anon, authenticated;\n" +
    "  grant  execute on function <assinatura> to service_role;\n" +
    "Ver supabase/migrations/0151_fecha_rpcs_security_definer.sql.\n",
)
process.exit(1)
