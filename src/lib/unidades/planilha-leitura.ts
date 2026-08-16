import "server-only"

/**
 * Lê a planilha de unidades e diz o que ela FARIA — sem gravar nada.
 *
 * ── A PRÉVIA NÃO É LUXO ──────────────────────────────────────────────────
 * Importação em massa é a operação com maior potencial de estrago do sistema:
 * uma coluna deslocada e 300 lojas ganham o telefone da vizinha. O caminho
 * "sobe o arquivo e reza" transforma um erro de digitação em um problema de
 * banco.
 *
 * Por isso são duas etapas separadas: esta lê e classifica cada linha (cria /
 * atualiza / erro), e outra grava só depois que a pessoa viu o resumo e
 * confirmou. A mesma disciplina do resto do sistema — mostrar o número antes
 * de agir.
 *
 * ⚠️ AS REGRAS SÃO AS MESMAS DO FORMULÁRIO. Se a planilha aceitasse o que a
 * tela recusa, existiriam dois cadastros com padrões diferentes na mesma base
 * — e o caminho fácil (planilha) seria o que suja o dado.
 */
import * as XLSX from "xlsx"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { normalizarCnpj } from "@/lib/cnpj"
import { COLUNAS, acharColuna, idDaOpcao, normalizar } from "./planilha-colunas"
import type { CanalId } from "@/components/platform-logo"

const PLATAFORMAS_VALIDAS = ["ifood", "99food", "keeta", "cardapioweb"] as const
/** Teto por arquivo. Acima disso a função da Vercel estoura o tempo. */
export const MAX_LINHAS = 1000

export type LinhaLida = {
  /** Linha no arquivo (2 = primeira depois do cabeçalho), pra pessoa achar. */
  linha: number
  code: string
  name: string
  acao: "criar" | "atualizar" | "erro"
  /** Motivos, quando `acao === "erro"`. */
  erros: string[]
  /** Campos que MUDAM numa atualização — pra prévia não dizer que mexe em tudo. */
  mudancas: string[]
  /** Já validado e pronto pra gravar. Ausente quando tem erro. */
  dados?: DadosUnidade
  unitId?: string
}

export type DadosUnidade = {
  code: string
  name: string
  cnpj: string
  active: boolean
  platforms: CanalId[]
  data_inauguracao: string | null
  [campo: string]: unknown
}

export type PreviaImportacao = {
  linhas: LinhaLida[]
  criar: number
  atualizar: number
  erros: number
  /** Problemas do arquivo inteiro (cabeçalho faltando, planilha vazia). */
  fatais: string[]
}

export async function lerPlanilhaUnidades(
  arquivo: File,
): Promise<PreviaImportacao> {
  const vazio: PreviaImportacao = {
    linhas: [],
    criar: 0,
    atualizar: 0,
    erros: 0,
    fatais: [],
  }

  const buf = new Uint8Array(await arquivo.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "array" })
  } catch {
    return { ...vazio, fatais: ["Não consegui abrir o arquivo. Ele é .xlsx?"] }
  }

  // A aba "Unidades" por nome; se a pessoa renomeou, cai na primeira.
  const nomeAba =
    wb.SheetNames.find((n) => normalizar(n) === "unidades") ?? wb.SheetNames[0]
  const aba = nomeAba ? wb.Sheets[nomeAba] : undefined
  if (!aba) return { ...vazio, fatais: ["A planilha não tem nenhuma aba."] }

  const matriz = XLSX.utils.sheet_to_json<string[]>(aba, {
    header: 1,
    raw: false,
    defval: "",
  })
  if (matriz.length < 2) {
    return { ...vazio, fatais: ["A planilha está vazia (só o cabeçalho)."] }
  }

  // ── Cabeçalho → posição de cada coluna ─────────────────────────────────
  const cabecalho = (matriz[0] ?? []).map((c) => String(c ?? ""))
  const posicao = new Map<string, number>()
  cabecalho.forEach((titulo, i) => {
    const col = acharColuna(titulo)
    if (col && !posicao.has(col.campo)) posicao.set(col.campo, i)
  })

  const faltando = COLUNAS.filter(
    (c) => c.obrigatorio && !posicao.has(c.campo),
  ).map((c) => c.titulo)
  if (faltando.length > 0) {
    return {
      ...vazio,
      fatais: [
        `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(", ")}. Baixe o modelo de novo e cole seus dados nele.`,
      ],
    }
  }

  const corpo = matriz.slice(1)
  if (corpo.length > MAX_LINHAS) {
    return {
      ...vazio,
      fatais: [
        `A planilha tem ${corpo.length} linhas e o limite por arquivo é ${MAX_LINHAS}. Divida em partes.`,
      ],
    }
  }

  // ── Lojas que já existem, pra saber o que é criação e o que é atualização ─
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()
  let qExistentes = admin
    .from("units")
    .select(
      "id, code, name, cnpj, active, razao_social, tipo_cozinha, logradouro, numero, complemento, bairro, city, state, cep, telefone, responsavel_nome, responsavel_email, tipo_operacao, regime_fiscal, tipo_entrega, data_inauguracao",
    )
  if (allowed !== null) {
    if (allowed.length === 0) qExistentes = qExistentes.in("id", ["-"])
    else qExistentes = qExistentes.in("id", allowed)
  }
  const { data: existentesRaw } = await qExistentes
  const existentes = new Map<string, Record<string, unknown>>()
  for (const u of (existentesRaw ?? []) as Record<string, unknown>[]) {
    existentes.set(normalizar(String(u.code ?? "")), u)
  }

  /**
   * Cidades já na grafia do IBGE, ANTES de comparar.
   *
   * Sem isto a prévia mentia por omissão: a planilha traz "sao paulo", o banco
   * tem "São Paulo", e a comparação crua acusava "Cidade" como alteração em
   * toda loja — numa rede de 300, trezentas mudanças fantasma que fariam
   * qualquer um desistir de conferir a lista.
   *
   * Em LOTE, numa consulta só. Chamar `normalizar_cidade` por linha seriam 300
   * idas ao banco pra responder 40 perguntas distintas.
   */
  const paresCidade = new Set<string>()
  corpo.forEach((celulas) => {
    const idxC = posicao.get("city")
    const idxU = posicao.get("state")
    if (idxC === undefined || idxU === undefined) return
    const c = String(celulas[idxC] ?? "").trim()
    const u = String(celulas[idxU] ?? "").trim().toUpperCase()
    if (c && u) paresCidade.add(`${u}|${c}`)
  })
  const cidadeOficial = new Map<string, string>()
  if (paresCidade.size > 0) {
    const { data: municipios } = await admin
      .from("municipios_ibge")
      .select("uf, chave, nome")
      .in(
        "uf",
        Array.from(new Set(Array.from(paresCidade).map((p) => p.split("|")[0]))),
      )
    const porChave = new Map(
      ((municipios ?? []) as { uf: string; chave: string; nome: string }[]).map(
        (m) => [`${m.uf}|${m.chave}`, m.nome],
      ),
    )
    for (const par of paresCidade) {
      const [uf, cidade] = par.split("|")
      const oficial = porChave.get(`${uf}|${normalizar(cidade)}`)
      if (oficial) cidadeOficial.set(par, oficial)
    }
  }

  const linhas: LinhaLida[] = []
  const codigosNoArquivo = new Map<string, number>()

  corpo.forEach((celulas, i) => {
    const numeroLinha = i + 2
    const pega = (campo: string): string => {
      const p = posicao.get(campo)
      return p === undefined ? "" : String(celulas[p] ?? "").trim()
    }

    // Linha totalmente vazia é o resto do modelo — ignora sem reclamar.
    if (COLUNAS.every((c) => pega(c.campo) === "")) return

    const erros: string[] = []
    const code = pega("code")
    const name = pega("name")

    if (!code) erros.push("Código vazio")
    if (!name) erros.push("Nome vazio")

    // Código repetido DENTRO do arquivo: sem isso, duas linhas com o mesmo
    // código gravariam uma por cima da outra e a segunda venceria em silêncio.
    if (code) {
      const chave = normalizar(code)
      const antes = codigosNoArquivo.get(chave)
      if (antes) erros.push(`Código repetido (já usado na linha ${antes})`)
      else codigosNoArquivo.set(chave, numeroLinha)
    }

    // `normalizarCnpj` CONFERE os dígitos verificadores, não só o tamanho —
    // é a mesma função do formulário. Contar 14 dígitos deixaria passar
    // "11.111.111/1111-11", e o erro só apareceria dias depois, quando o
    // vínculo com o iFood não casasse.
    const cnpjRaw = pega("cnpj")
    const cnpj = normalizarCnpj(cnpjRaw)
    if (!cnpjRaw) erros.push("CNPJ vazio")
    else if (!cnpj) erros.push(`CNPJ inválido (${cnpjRaw})`)

    const uf = pega("state").toUpperCase()
    if (!/^[A-Z]{2}$/.test(uf)) erros.push(`UF inválida (${pega("state") || "vazia"})`)

    const dataInaug = paraISO(pega("data_inauguracao"))
    if (!dataInaug) {
      erros.push(
        pega("data_inauguracao")
          ? `Inauguração em formato não reconhecido (${pega("data_inauguracao")}) — use DD/MM/AAAA`
          : "Inauguração vazia",
      )
    }

    const plataformas = pega("platforms")
      .split(/[;,/]/)
      .map((p) => normalizar(p))
      .filter(Boolean)
    const invalidas = plataformas.filter(
      (p) => !(PLATAFORMAS_VALIDAS as readonly string[]).includes(p),
    )
    if (plataformas.length === 0) erros.push("Nenhuma plataforma informada")
    else if (invalidas.length > 0) {
      erros.push(
        `Plataforma desconhecida: ${invalidas.join(", ")} — use ifood, 99food, keeta ou cardapioweb`,
      )
    }

    // Campos de texto obrigatórios + listas fechadas.
    const dados: DadosUnidade = {
      code,
      name,
      cnpj: cnpj ?? "",
      active: normalizar(pega("active")) !== "nao",
      platforms: plataformas as CanalId[],
      data_inauguracao: dataInaug,
      state: uf,
    }

    for (const c of COLUNAS) {
      if (["code", "name", "cnpj", "state", "platforms", "active", "data_inauguracao"].includes(c.campo)) {
        continue
      }
      const valor = pega(c.campo)
      if (c.obrigatorio && !valor) {
        erros.push(`${c.titulo} vazio`)
        continue
      }
      if (!valor) {
        dados[c.campo] = null
        continue
      }
      if (c.campo === "city") {
        // A gravação normaliza de novo (é a fonte da verdade); aqui é pra a
        // COMPARAÇÃO da prévia enxergar a mesma grafia que vai pro banco.
        dados.city = cidadeOficial.get(`${uf}|${valor}`) ?? valor
        continue
      }
      if (c.opcoes) {
        const id = idDaOpcao(c, valor)
        if (!id) {
          erros.push(
            `${c.titulo}: "${valor}" não é uma opção válida — veja a aba "Como preencher"`,
          )
          continue
        }
        dados[c.campo] = id
      } else {
        dados[c.campo] = valor
      }
    }

    const existente = code ? existentes.get(normalizar(code)) : undefined

    if (erros.length > 0) {
      linhas.push({ linha: numeroLinha, code, name, acao: "erro", erros, mudancas: [] })
      return
    }

    if (!existente) {
      linhas.push({ linha: numeroLinha, code, name, acao: "criar", erros: [], mudancas: [], dados })
      return
    }

    // ── O que MUDA de verdade ────────────────────────────────────────────
    // A prévia precisa distinguir "atualiza 300 lojas" de "atualiza 300 lojas
    // sem mudar nada". Sem isso, quem reexporta e reimporta sem editar levaria
    // um susto — e não teria como saber se algo se perdeu no caminho.
    const mudancas: string[] = []
    for (const c of COLUNAS) {
      if (c.campo === "platforms") continue // comparado na hora de gravar
      const novo = c.campo === "active" ? dados.active : dados[c.campo]
      const velho =
        c.campo === "active" ? existente.active !== false : existente[c.campo]
      const iguais =
        (novo ?? "") === (velho ?? "") ||
        String(novo ?? "") === String(velho ?? "")
      if (!iguais) mudancas.push(c.titulo)
    }

    linhas.push({
      linha: numeroLinha,
      code,
      name,
      acao: "atualizar",
      erros: [],
      mudancas,
      dados,
      unitId: String(existente.id),
    })
  })

  return {
    linhas,
    criar: linhas.filter((l) => l.acao === "criar").length,
    atualizar: linhas.filter((l) => l.acao === "atualizar").length,
    erros: linhas.filter((l) => l.acao === "erro").length,
    fatais: [],
  }
}

/**
 * Data em qualquer formato que o Excel devolve → YYYY-MM-DD.
 *
 * O `raw: false` da leitura já formata as células de data, mas o formato
 * depende da configuração da MÁQUINA de quem salvou — e uma planilha vinda de
 * um Excel em inglês chega como MM/DD/YYYY. Por isso a leitura aceita as duas
 * ordens e o ISO, em vez de assumir uma.
 */
function paraISO(valor: string): string | null {
  const v = valor.trim()
  if (!v) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v)
  if (br) {
    const [, a, b] = br
    let ano = br[3]
    if (ano.length === 2) ano = `20${ano}`
    // Dia > 12 desempata: só pode ser dia. Sem pista, assume DD/MM (Brasil).
    const dia = Number(a) > 12 ? a : Number(b) > 12 ? b : a
    const mes = dia === a ? b : a
    const d = Number(dia)
    const m = Number(mes)
    if (d < 1 || d > 31 || m < 1 || m > 12) return null
    return `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return null
}
