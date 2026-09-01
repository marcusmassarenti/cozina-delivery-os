/**
 * Cadastro em lote das 17 marcas do Grupo Le Brunch (pedido do Marcus,
 * 01/09/26). Dark kitchens: 4 CNPJs reais compartilhados por 17 marcas
 * virtuais, cada uma numa plataforma. Dados de endereço/razão vêm da
 * BrasilAPI (JSONs baixados no scratchpad). "THE SALAD" já existia (code 01)
 * — é ATUALIZADA, não duplicada.
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { readFileSync } from "node:fs"
import { createAdminClient } from "@/lib/supabase/admin"

const BRAND_ID = "44f43c68-70ea-45f6-850c-50ca5affcdfb" // Grupo Le Brunch
const SCRATCH = "/private/tmp/claude-501/-Users-marcusmassarenti-Desktop-Claude/fb0bce06-ad2e-404f-9075-e5402013fe61/scratchpad"

const LOJAS: { nome: string; cnpj: string; plataforma: "ifood" | "99food" | "keeta" }[] = [
  { nome: "Parmegiana Crocante", cnpj: "53457789000170", plataforma: "ifood" },
  { nome: "The Salad", cnpj: "53457789000170", plataforma: "ifood" },
  { nome: "Marmitex Lorena", cnpj: "50861393000104", plataforma: "ifood" },
  { nome: "Piadina Lovers", cnpj: "53457789000170", plataforma: "ifood" },
  { nome: "Nonna Parmegianas - Jardins", cnpj: "50861393000104", plataforma: "ifood" },
  { nome: "Lorena Marmitas - Jardins", cnpj: "50861393000104", plataforma: "ifood" },
  { nome: "Piadina Lovers - Jardins", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "A Casa do Strogonoff - Jardins", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Antonella Restaurante", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Jardinier - Saladas e Wraps", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Marmitas e Refeições Jardins", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Parmegiana Paulista", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Veg Lovers - Jardins", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Energy Box - Refeições e Bebidas Saudáveis", cnpj: "33584039000152", plataforma: "99food" },
  { nome: "Salada Lovers", cnpj: "50861393000104", plataforma: "keeta" },
  { nome: "Parmegiana Lovers", cnpj: "59423006000114", plataforma: "keeta" },
  { nome: "Marmitex Lovers", cnpj: "53457789000170", plataforma: "keeta" },
]

function fmtCnpj(c: string): string {
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}
function cidadeBonita(m: string): string {
  return m.toLowerCase().split(" ").map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ")
}

async function main() {
  const admin = createAdminClient()
  const receita = new Map(
    ["53457789000170", "50861393000104", "33584039000152", "59423006000114"].map((c) => [
      c,
      JSON.parse(readFileSync(`${SCRATCH}/cnpj_${c}.json`, "utf8")),
    ]),
  )

  const { data: existentes } = await admin
    .from("units").select("id, code, name").eq("brand_id", BRAND_ID)
  const porNome = new Map((existentes ?? []).map((u) => [u.name.trim().toLowerCase(), u]))
  let prox = Math.max(0, ...(existentes ?? []).map((u) => parseInt(u.code, 10) || 0)) + 1

  for (const l of LOJAS) {
    const r = receita.get(l.cnpj)!
    const base = {
      name: l.nome,
      cnpj: fmtCnpj(l.cnpj),
      active: true,
      tipo_cozinha: "brasileira",
      tipo_operacao: "propria",
      tipo_entrega: "plataforma",
      data_inauguracao: "2026-01-01",
      responsavel_nome: "André",
      responsavel_email: "and_moreira@uol.com.br",
      razao_social: r.razao_social ?? null,
      situacao_cadastral: r.descricao_situacao_cadastral ?? null,
      cnae_descricao: r.cnae_fiscal_descricao ?? null,
      cep: r.cep ?? null,
      logradouro: r.logradouro ?? null,
      numero: r.numero ?? null,
      complemento: r.complemento || null,
      bairro: r.bairro ?? null,
      city: cidadeBonita(r.municipio ?? ""),
      state: r.uf ?? "SP",
      telefone: r.ddd_telefone_1 || null,
    }

    const jaExiste = porNome.get(l.nome.trim().toLowerCase())
    let unitId: string
    if (jaExiste) {
      const { error } = await admin.from("units").update(base).eq("id", jaExiste.id)
      if (error) { console.log(`ERRO update ${l.nome}: ${error.message}`); continue }
      unitId = jaExiste.id
      console.log(`~ atualizada ${jaExiste.code} ${l.nome}`)
    } else {
      const code = String(prox++).padStart(2, "0")
      const { data, error } = await admin
        .from("units").insert({ ...base, code, brand_id: BRAND_ID }).select("id").single()
      if (error) { console.log(`ERRO insert ${l.nome}: ${error.message}`); prox--; continue }
      unitId = data!.id
      console.log(`+ criada ${code} ${l.nome} (${l.plataforma})`)
    }

    const { error: pErr } = await admin
      .from("unit_platforms")
      .upsert({ unit_id: unitId, platform: l.plataforma, active: true }, { onConflict: "unit_id,platform" })
    if (pErr) console.log(`  ERRO plataforma ${l.nome}: ${pErr.message}`)
  }
  console.log("FIM")
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
