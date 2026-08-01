/**
 * Preenche o cadastro das unidades a partir do CNPJ (BrasilAPI / Receita).
 *
 * Duas passadas de propósito: a consulta é cara e tem limite de requisição,
 * então a primeira grava o resultado cru num JSON e a segunda lê de lá. Assim
 * dá pra conferir o que veio antes de escrever no banco, e reprocessar sem
 * bater na Receita de novo.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/backfill-receita.ts "DG FOODS"            # consulta e mostra
 *   ... scripts/backfill-receita.ts "DG FOODS" --aplicar # grava
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs"

import { createAdminClient } from "../src/lib/supabase/admin"

const CACHE = "/tmp/receita-cache.json"
const holdingNome = process.argv[2] ?? "DG FOODS"
const aplicar = process.argv.includes("--aplicar")

type Receita = {
  razao_social?: string
  nome_fantasia?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cep?: string
  municipio?: string
  uf?: string
  ddd_telefone_1?: string
  cnae_fiscal?: number
  cnae_fiscal_descricao?: string
  data_inicio_atividade?: string
  descricao_situacao_cadastral?: string
}

const digitos = (s: string) => s.replace(/\D/g, "")

function limpaTelefone(t?: string) {
  const d = digitos(t ?? "")
  if (d.length < 10) return null
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

async function consultar(cnpj: string): Promise<Receita | null> {
  try {
    // Sem User-Agent a BrasilAPI responde 403. O fetch do Node não manda um
    // por padrão (o do navegador manda) — foi por isso que a primeira rodada
    // voltou com as 56 lojas "não encontradas".
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { "User-Agent": "cozina-delivery-os/1.0" },
    })
    if (!r.ok) {
      console.log(`  [${cnpj}] HTTP ${r.status}`)
      return null
    }
    return (await r.json()) as Receita
  } catch (e) {
    console.log(`  [${cnpj}] ${(e as Error).message}`)
    return null
  }
}

async function main() {
  const admin = createAdminClient()

  const { data: holding } = await admin
    .from("holdings")
    .select("id")
    .eq("name", holdingNome)
    .single()
  if (!holding) throw new Error(`Holding "${holdingNome}" não encontrada`)

  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holding.id)

  const { data: units } = await admin
    .from("units")
    .select("id, code, name, cnpj, city, razao_social")
    .in("brand_id", (brands ?? []).map((b) => b.id))
    .eq("active", true)
    .order("code")

  const alvos = (units ?? []).filter((u) => digitos(u.cnpj ?? "").length === 14)
  console.log(
    `${units?.length ?? 0} unidades ativas · ${alvos.length} com CNPJ válido\n`,
  )

  const cache: Record<string, Receita> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, "utf8"))
    : {}

  for (const u of alvos) {
    const cnpj = digitos(u.cnpj!)
    if (!cache[cnpj]) {
      const r = await consultar(cnpj)
      if (r) cache[cnpj] = r
      // A BrasilAPI é gratuita e limita por minuto. Uma consulta por segundo
      // atravessa a rede inteira sem tomar 429.
      await new Promise((s) => setTimeout(s, 1100))
    }
    const r = cache[cnpj]
    console.log(
      `${u.code.padEnd(4)} ${(u.name ?? "").slice(0, 28).padEnd(28)} ${
        r ? `✓ ${r.razao_social?.slice(0, 40)}` : "✗ não achou"
      }`,
    )
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 1))

  if (!aplicar) {
    console.log(`\nConsulta só. Rode com --aplicar pra gravar.`)
    return
  }

  let gravadas = 0
  for (const u of alvos) {
    const r = cache[digitos(u.cnpj!)]
    if (!r) continue
    const { error } = await admin
      .from("units")
      .update({
        razao_social: r.razao_social ?? null,
        nome_fantasia: r.nome_fantasia || null,
        logradouro: r.logradouro ?? null,
        numero: r.numero ?? null,
        complemento: r.complemento || null,
        bairro: r.bairro ?? null,
        cep: r.cep ? digitos(r.cep) : null,
        // Cidade/UF só entram se estiverem vazias: o nome que o Marcus usa
        // pode ser o do bairro comercial, e a Receita não sabe disso.
        city: u.city || r.municipio || null,
        telefone: limpaTelefone(r.ddd_telefone_1),
        cnae_codigo: r.cnae_fiscal ? String(r.cnae_fiscal) : null,
        cnae_descricao: r.cnae_fiscal_descricao ?? null,
        data_abertura: r.data_inicio_atividade ?? null,
        situacao_cadastral: r.descricao_situacao_cadastral ?? null,
        receita_consultada_em: new Date().toISOString(),
      })
      .eq("id", u.id)
    if (error) console.log(`  erro em ${u.code}: ${error.message}`)
    else gravadas++
  }
  console.log(`\n${gravadas} unidades atualizadas.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
