import "server-only"

/**
 * A planilha de unidades, em dois sabores.
 *
 * ── POR QUE DOIS ARQUIVOS E NÃO UM ───────────────────────────────────────
 * Começou como um só, que vinha com as lojas atuais dentro — e o Marcus
 * separou (16/08/26): "baixar planilha sempre a modelo; exportar as unidades
 * deveria vir minha lista".
 *
 * Ele está certo, e o motivo é que são duas intenções diferentes:
 *
 *   MODELO  — "vou cadastrar 300 lojas novas". Arquivo vazio. Qualquer linha
 *             preenchida é uma loja nova, sem risco de mexer no que existe.
 *   EXPORTAR — "quero ver/corrigir o que já tenho". Vem preenchido, e como a
 *             importação casa por código, editar e devolver ATUALIZA.
 *
 * Misturar os dois num arquivo só faz quem queria cadastrar receber 300 linhas
 * que não pediu, e obriga a apagá-las — mexendo justamente no que não deveria
 * tocar.
 *
 * ⚠️ NENHUM DOS DOIS exporta loja fora do escopo do usuário: a planilha é do
 * cliente, e devolvê-la por importação criaria cópias de loja alheia na rede
 * dele.
 */
import * as XLSX from "xlsx"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import {
  COLUNAS,
  CABECALHO,
  PSEUDO_CAMPOS,
  CAMPO_ID_POR_PLATAFORMA,
} from "./planilha-colunas"

/** Linhas em branco. No modelo são muitas; no export, um punhado. */
const LINHAS_MODELO = 200
const LINHAS_EXPORT = 20

type UnidadeExport = Record<string, unknown> & {
  id: string
  code: string | null
}

export async function gerarPlanilhaUnidades(
  opts: { comDados: boolean },
): Promise<Uint8Array> {
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  // Pseudo-campos ficam de fora: não são colunas de `units`. A lista mora em
  // planilha-colunas pra que acrescentar um pseudo-campo novo não exija
  // lembrar deste filtro aqui — foi assim que os IDs por plataforma passaram
  // anos sem existir na planilha.
  const campos = COLUNAS.map((c) => c.campo).filter((c) => !PSEUDO_CAMPOS.has(c))
  let q = admin
    .from("units")
    .select(`id, active, ${campos.join(", ")}`)
    .order("code")
  if (allowed !== null) {
    if (allowed.length === 0) q = q.in("id", ["-"])
    else q = q.in("id", allowed)
  }
  const { data, error } = opts.comDados
    ? await q
    : { data: [] as unknown, error: null }
  if (error) throw new Error(`Falha ao montar a planilha: ${error.message}`)
  const unidades = ((data ?? []) as unknown as UnidadeExport[]).filter(Boolean)

  // Plataformas numa consulta só (uma por loja seriam N idas ao banco).
  const ids = unidades.map((u) => u.id)
  const { data: plats } = ids.length
    ? await admin
        .from("unit_platforms")
        .select("unit_id, platform, external_store_id")
        .eq("active", true)
        .in("unit_id", ids)
    : {
        data: [] as {
          unit_id: string
          platform: string
          external_store_id: string | null
        }[],
      }
  const porUnidade = new Map<string, string[]>()
  const idPorLojaEPlataforma = new Map<string, string>()
  for (const p of (plats ?? []) as {
    unit_id: string
    platform: string
    external_store_id: string | null
  }[]) {
    porUnidade.set(p.unit_id, [...(porUnidade.get(p.unit_id) ?? []), p.platform])
    if (p.external_store_id) {
      idPorLojaEPlataforma.set(`${p.unit_id}|${p.platform}`, p.external_store_id)
    }
  }

  const linhas = unidades.map((u) =>
    COLUNAS.map((c) => {
      if (c.campo === "platforms") return (porUnidade.get(u.id) ?? []).join(";")
      if (c.campo === "active") return u.active === false ? "não" : "sim"
      const plataformaDoId = (
        Object.entries(CAMPO_ID_POR_PLATAFORMA) as [string, string][]
      ).find(([, campo]) => campo === c.campo)?.[0]
      if (plataformaDoId) {
        return idPorLojaEPlataforma.get(`${u.id}|${plataformaDoId}`) ?? ""
      }
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

  const emBranco = opts.comDados ? LINHAS_EXPORT : LINHAS_MODELO
  for (let i = 0; i < emBranco; i++) {
    linhas.push(COLUNAS.map(() => ""))
  }

  const aba = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas])
  aba["!cols"] = COLUNAS.map((c) => ({ wch: c.largura }))
  // Congela o cabeçalho: com 300 linhas, rolar sem ele é preencher às cegas.
  aba["!freeze"] = { xSplit: 0, ySplit: 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, aba, "Unidades")
  XLSX.utils.book_append_sheet(wb, abaInstrucoes(opts.comDados), "LEIA-ME")

  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  )
}

/**
 * A aba de instruções não é enfeite: metade dos campos é lista fechada, e sem
 * os valores aceitos escritos em algum lugar a pessoa inventa ("Pizzaria" vs
 * "pizza") e a importação recusa a linha. Melhor entregar a resposta junto.
 */
function abaInstrucoes(comDados: boolean): XLSX.WorkSheet {
  const linhas: string[][] = comDados
    ? [
        ["LEIA-ME — planilha das suas unidades"],
        [],
        ["Esta planilha veio com as SUAS LOJAS ATUAIS já preenchidas."],
        [
          "Corrija o que estiver errado ou faltando e traga de volta: o sistema atualiza as lojas.",
        ],
        [],
        ["⚠️ A coluna Código é a CHAVE. Não mexa nela."],
        [
          "Código que já existe ATUALIZA aquela loja. Código novo CRIA uma loja nova.",
        ],
        [
          "Se você trocar o código de uma linha, o sistema entende que é outra loja e cria uma duplicada.",
        ],
        [],
        ["Para cadastrar lojas novas em massa, prefira a PLANILHA MODELO"],
        ["(botão 'Importar em massa' na tela de Unidades) — ela vem vazia."],
        [],
        [
          "⚠️ IDs DAS PLATAFORMAS: formate as colunas ID iFood / ID 99 Food / ID Keeta como TEXTO antes de colar. O ID do 99 tem 19 dígitos e o Excel o transforma em número, perdendo os últimos dígitos — a importação recusa a linha em vez de gravar um ID errado.",
        ],
        [],

        ["Salve sempre como .xlsx. CSV NÃO é aceito:"],
        [
          "o Excel em português separa CSV por ponto e vírgula, e a coluna Plataformas usa ponto e vírgula por dentro (ifood;99food) — o arquivo desalinha e grava dado trocado.",
        ],
        [],
        [
          "Nada é gravado antes de você conferir: ao subir o arquivo o sistema mostra o que vai criar, o que vai mudar e o que deu erro, linha por linha.",
        ],
        [],
        ["Coluna", "Obrigatório", "Como preencher"],
      ]
    : [
        ["LEIA-ME — planilha modelo de unidades"],
        [],
        ["Preencha UMA LINHA POR LOJA na aba 'Unidades'. Não mude o cabeçalho."],
        [],
        ["⚠️ A coluna Código é a CHAVE da importação."],
        ["Código que ainda não existe CRIA a loja. Código que já existe ATUALIZA a loja."],
        [
          "Use um código por loja e não repita — código repetido dentro do arquivo é recusado.",
        ],
        [],
        [
          "Quer corrigir lojas que JÁ existem? Use o botão 'Exportar unidades' na tela: ele traz a sua lista preenchida.",
        ],
        [],
        ["Salve como .xlsx. CSV NÃO é aceito:"],
        [
          "o Excel em português separa CSV por ponto e vírgula, e a coluna Plataformas usa ponto e vírgula por dentro (ifood;99food) — o arquivo desalinha e grava dado trocado.",
        ],
        [],
        [
          "⚠️ IDs DAS PLATAFORMAS: formate as colunas ID iFood / ID 99 Food / ID Keeta como TEXTO antes de colar. O ID do 99 tem 19 dígitos e o Excel o transforma em número, perdendo os últimos dígitos — a importação recusa a linha em vez de gravar um ID errado.",
        ],
        [],
        [
          "Nada é gravado antes de você conferir: ao subir o arquivo o sistema mostra o que vai criar, o que vai mudar e o que deu erro, linha por linha. Linha com erro fica de fora; o resto entra normalmente.",
        ],
        [],
        ["EXEMPLO de uma linha preenchida"],
        ["Código", "01"],
        ["Nome da unidade", "Jardins"],
        ["CNPJ", "33.584.039/0001-52"],
        ["Tipo de cozinha", "Marmita / Prato feito"],
        ["Cidade / UF", "São Paulo / SP"],
        ["Inauguração", "15/03/2025"],
        ["Plataformas", "ifood;99food;keeta"],
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
