import "server-only"

/**
 * A planilha de unidades: modelo pra preencher E retrato do que já existe.
 *
 * ── POR QUE VEM COM AS LOJAS ATUAIS DENTRO ───────────────────────────────
 * O pedido do Marcus foi "exportar um modelo pra preencher e importar em massa
 * um número grande de unidades". Um modelo vazio resolve isso — e joga fora
 * metade do valor.
 *
 * Como a importação casa por CÓDIGO (existe = atualiza), a MESMA planilha que
 * cadastra 300 lojas novas serve pra completar as que já estão pela metade. No
 * dia em que isto foi escrito eram 116 informações faltando em 11 lojas, e
 * arrumar isso na tela significa abrir 11 formulários. Na planilha é uma
 * coluna arrastada pra baixo.
 *
 * Por isso o arquivo sai com as lojas atuais preenchidas e linhas em branco
 * embaixo pra acrescentar. Quem só quer cadastrar novas ignora o que veio.
 *
 * ⚠️ NÃO exporta loja de outra empresa (compartilhada) nem loja fora do escopo
 * do usuário: a planilha é do cliente, e devolver ela por importação criaria
 * cópias de loja alheia dentro da rede dele.
 */
import * as XLSX from "xlsx"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { COLUNAS, CABECALHO } from "./planilha-colunas"

/** Quantas linhas vazias sobram pra cadastrar loja nova. */
const LINHAS_EM_BRANCO = 30

type UnidadeExport = Record<string, unknown> & {
  id: string
  code: string | null
}

export async function gerarPlanilhaUnidades(): Promise<Uint8Array> {
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  const campos = COLUNAS.map((c) => c.campo).filter(
    (c) => c !== "platforms" && c !== "active",
  )
  let q = admin
    .from("units")
    .select(`id, active, ${campos.join(", ")}`)
    .order("code")
  if (allowed !== null) {
    if (allowed.length === 0) q = q.in("id", ["-"])
    else q = q.in("id", allowed)
  }
  const { data, error } = await q
  if (error) throw new Error(`Falha ao montar a planilha: ${error.message}`)
  const unidades = ((data ?? []) as unknown as UnidadeExport[]).filter(Boolean)

  // Plataformas numa consulta só (uma por loja seriam N idas ao banco).
  const ids = unidades.map((u) => u.id)
  const { data: plats } = ids.length
    ? await admin
        .from("unit_platforms")
        .select("unit_id, platform")
        .eq("active", true)
        .in("unit_id", ids)
    : { data: [] as { unit_id: string; platform: string }[] }
  const porUnidade = new Map<string, string[]>()
  for (const p of (plats ?? []) as { unit_id: string; platform: string }[]) {
    porUnidade.set(p.unit_id, [...(porUnidade.get(p.unit_id) ?? []), p.platform])
  }

  const linhas = unidades.map((u) =>
    COLUNAS.map((c) => {
      if (c.campo === "platforms") return (porUnidade.get(u.id) ?? []).join(";")
      if (c.campo === "active") return u.active === false ? "não" : "sim"
      const bruto = u[c.campo]
      if (bruto === null || bruto === undefined) return ""
      if (c.campo === "data_inauguracao") return paraDataBR(String(bruto))
      // Campo de lista sai com o RÓTULO, não com o id: quem abre a planilha
      // precisa entender o que está escrito. A leitura aceita os dois.
      if (c.opcoes) {
        return c.opcoes.find((o) => o.id === String(bruto))?.label ?? String(bruto)
      }
      return String(bruto)
    }),
  )

  for (let i = 0; i < LINHAS_EM_BRANCO; i++) {
    linhas.push(COLUNAS.map(() => ""))
  }

  const aba = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas])
  aba["!cols"] = COLUNAS.map((c) => ({ wch: c.largura }))
  // Congela o cabeçalho: com 300 linhas, rolar sem ele é preencher às cegas.
  aba["!freeze"] = { xSplit: 0, ySplit: 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, aba, "Unidades")
  XLSX.utils.book_append_sheet(wb, abaInstrucoes(), "Como preencher")

  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  )
}

/**
 * A aba de instruções não é enfeite: metade dos campos é lista fechada, e sem
 * os valores aceitos escritos em algum lugar a pessoa inventa ("Pizzaria" vs
 * "pizza") e a importação recusa a linha. Melhor entregar a resposta junto.
 */
function abaInstrucoes(): XLSX.WorkSheet {
  const linhas: string[][] = [
    ["Como preencher esta planilha"],
    [],
    [
      "1. A aba 'Unidades' já vem com as suas lojas atuais. Corrija o que estiver errado ou faltando.",
    ],
    ["2. Para cadastrar loja nova, use as linhas em branco no fim."],
    [
      "3. A coluna Código é a chave: código que já existe ATUALIZA a loja; código novo CRIA.",
    ],
    ["4. Salve como .xlsx e volte em Unidades → Importar planilha."],
    [
      "5. Antes de gravar qualquer coisa, o sistema mostra o que vai criar, o que vai atualizar e o que tem erro.",
    ],
    [],
    ["Coluna", "Obrigatório", "Como preencher"],
  ]
  for (const c of COLUNAS) {
    linhas.push([c.titulo, c.obrigatorio ? "sim" : "não", c.ajuda])
  }
  linhas.push([])
  linhas.push(["Valores aceitos nos campos de lista"])
  for (const c of COLUNAS.filter((x) => x.opcoes)) {
    linhas.push([])
    linhas.push([c.titulo])
    for (const o of c.opcoes!) linhas.push(["", o.label, `(também aceita: ${o.id})`])
  }

  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 110 }]
  return aba
}

/** YYYY-MM-DD → DD/MM/AAAA, que é como o brasileiro lê e digita. */
function paraDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
