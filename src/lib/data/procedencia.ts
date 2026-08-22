/**
 * De onde vem o número que está na tela — e até quando ele alcança.
 *
 * ── O CASO QUE ORIGINOU (Marcus, 22/08/26) ───────────────────────────────
 * Um gestor exportou o relatório do mês e mandou pro cliente dele sem saber
 * que a importação da Keeta estava parada. O cliente questionou o número, e
 * ele não tinha resposta — não porque o sistema errou, mas porque o sistema
 * não contou o que sabia.
 *
 * A lição está no ARQUIVO, não na tela: o relatório sai do sistema e vira uma
 * afirmação na mão de um terceiro. Aviso que fica só na tela não viaja junto.
 *
 * ── AS TRÊS PERGUNTAS ────────────────────────────────────────────────────
 * Uma só não basta, e as três juntas são o que impede o aviso de virar ruído:
 *
 *  1. Até quando tem dado?          → já respondida por getImportCoverageForMonth
 *  2. Esta plataforma é DECLARADA?  → senão "faltando Keeta" aparece pra quem
 *                                     não tem Keeta, e o aviso perde o crédito
 *  3. O silêncio é falta de importação ou ausência de VENDA?
 *                                   → ver ifood_extrato_lido: sem essa
 *                                     distinção, loja que não vendeu acusaria
 *                                     lacuna todo dia até ninguém mais ler
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getImportCoverageForMonth } from "@/lib/data/relatorio-diario"

export type PlataformaProc = "ifood" | "99food" | "keeta" | "cardapioweb"

export type ProcedenciaPlataforma = {
  plataforma: PlataformaProc
  rotulo: string
  /** Alguma loja do recorte declara esta plataforma no cadastro. */
  declarada: boolean
  /** Último dia com dado no período (ISO). */
  ultimoDia: string | null
  /** Dias entre o último dado e o fim do período considerado. */
  lacunaDias: number
  estado: "em-dia" | "atrasada" | "sem-dado" | "fora"
  /** Frase pronta, do jeito que vai pro cabeçalho do arquivo. */
  frase: string
}

export type Procedencia = {
  /** Uma linha só, pro cabeçalho do relatório exportado. */
  linha: string
  plataformas: ProcedenciaPlataforma[]
  /** Há plataforma declarada com lacuna? É o que dispara a confirmação. */
  temLacuna: boolean
  /** As que estão com lacuna, pra frase do diálogo. */
  comLacuna: ProcedenciaPlataforma[]
  geradoEm: string
}

const ROTULO: Record<PlataformaProc, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/**
 * Folga antes de chamar de atraso — POR PLATAFORMA, porque a cadência é
 * diferente e um número só produziria alarme falso na maioria.
 *
 * ── POR QUE (medido em 22/08/26) ─────────────────────────────────────────
 * Com folga única de 2 dias, DG FOODS e Churrasco no Pote apareceriam com
 * "Keeta em atraso" no mesmo instante — e a Keeta não tem API, entra por
 * planilha que alguém sobe uma vez por semana. Quatro dias ali é rotina, não
 * problema. Diálogo que aparece toda vez vira clique automático, e aí ele
 * falha justamente no dia em que a falta é real.
 *
 * A DATA aparece sempre, para todas: transparência não depende de limiar. O
 * limiar decide só quando a coisa vira ALERTA e pede confirmação.
 */
const TOLERANCIA_DIAS: Record<PlataformaProc, number> = {
  ifood: 2,
  "99food": 3,
  // Planilha manual, sem API. Sobe por lote, tipicamente semanal.
  keeta: 7,
  cardapioweb: 2,
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function diasEntre(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00-03:00`).getTime() -
      new Date(`${a}T12:00:00-03:00`).getTime()) /
      86_400_000,
  )
}

/**
 * @param unitIds recorte de lojas (undefined = a holding inteira do contexto)
 * @param hojeISO data de referência — o fim do período, ou hoje se o mês é o corrente
 */
export async function procedenciaDoPeriodo(
  year: number,
  month: number,
  unitIds: string[] | undefined,
  hojeISO: string,
): Promise<Procedencia> {
  const admin = createAdminClient()

  // Fim do recorte: o menor entre o fim do mês e hoje. Mês fechado se compara
  // com o dia 31; mês corrente, com hoje — senão todo mês em andamento
  // apareceria "faltando" os dias que ainda não aconteceram.
  const ultimoDoMes = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate(),
  ).padStart(2, "0")}`
  const alvo = hojeISO < ultimoDoMes ? hojeISO : ultimoDoMes

  const [cobertura, declaradasRes] = await Promise.all([
    getImportCoverageForMonth(year, month, unitIds),
    (() => {
      let q = admin
        .from("unit_platforms")
        .select("platform, unit_id")
        .eq("active", true)
      if (unitIds) q = q.in("unit_id", unitIds)
      return q
    })(),
  ])

  const declaradas = new Set(
    ((declaradasRes.data ?? []) as { platform: string }[]).map((r) => r.platform),
  )

  const porPlataforma: Record<PlataformaProc, string | null> = {
    ifood: cobertura.ifood.lastDate,
    "99food": cobertura.ninefood.lastDate,
    keeta: cobertura.keeta.lastDate,
    cardapioweb: cobertura.cardapioweb.lastDate,
  }

  const plataformas: ProcedenciaPlataforma[] = (
    Object.keys(ROTULO) as PlataformaProc[]
  ).map((p) => {
    const rotulo = ROTULO[p]
    const declarada = declaradas.has(p)
    const ultimoDia = porPlataforma[p]

    if (!declarada) {
      return {
        plataforma: p,
        rotulo,
        declarada,
        ultimoDia,
        lacunaDias: 0,
        estado: "fora",
        frase: "",
      }
    }
    if (!ultimoDia) {
      return {
        plataforma: p,
        rotulo,
        declarada,
        ultimoDia: null,
        lacunaDias: diasEntre(`${year}-${String(month).padStart(2, "0")}-01`, alvo),
        estado: "sem-dado",
        frase: `${rotulo} sem dado nenhum no período`,
      }
    }
    const lacuna = Math.max(0, diasEntre(ultimoDia, alvo))
    const atrasada = lacuna > TOLERANCIA_DIAS[p]
    return {
      plataforma: p,
      rotulo,
      declarada,
      ultimoDia,
      lacunaDias: lacuna,
      estado: atrasada ? "atrasada" : "em-dia",
      frase: atrasada
        ? `${rotulo} até ${ddmm(ultimoDia)} — ${lacuna} dias sem importação`
        : `${rotulo} até ${ddmm(ultimoDia)}`,
    }
  })

  const usadas = plataformas.filter((p) => p.declarada)
  const comLacuna = usadas.filter(
    (p) => p.estado === "atrasada" || p.estado === "sem-dado",
  )

  const agora = new Date()
  const geradoEm = `${String(agora.getDate()).padStart(2, "0")}/${String(
    agora.getMonth() + 1,
  ).padStart(2, "0")} às ${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes(),
  ).padStart(2, "0")}`

  return {
    linha: usadas.map((p) => p.frase).join(" · "),
    plataformas,
    temLacuna: comLacuna.length > 0,
    comLacuna,
    geradoEm,
  }
}

/**
 * Mesma coisa, para relatórios que trabalham com INTERVALO em vez de mês.
 *
 * A cobertura é apurada por mês (é assim que o extrato do iFood chega), então
 * o que vale é o mês do FIM do intervalo: é ele que responde "até onde este
 * relatório enxerga". Um intervalo que termina em julho não deve reclamar de
 * agosto, e é isso que o alvo abaixo garante.
 */
export async function procedenciaDoRange(
  inicio: string,
  fim: string,
  unitIds: string[] | undefined,
): Promise<Procedencia> {
  const hoje = new Date().toISOString().slice(0, 10)
  const ano = Number(fim.slice(0, 4))
  const mes = Number(fim.slice(5, 7))
  // O alvo é o fim do intervalo, ou hoje se o intervalo ainda não terminou.
  return procedenciaDoPeriodo(ano, mes, unitIds, fim < hoje ? fim : hoje)
}
