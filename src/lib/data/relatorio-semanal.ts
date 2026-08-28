import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getRealMonthlyForUnitsForRange } from "./range-aggregation"

/**
 * Ciclo semanal da agência — o número sai calculado, o texto é do gestor.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ───────────────────────────────────────────
 * No painel que a agência usa hoje, o campo é "Informe o faturamento da
 * semana" — DIGITADO À MÃO. O gestor da Prime descreveu, em 25/08/26, uma
 * pessoa cuja função era abrir o portal da plataforma, copiar e colar. Ele
 * mesmo chamou de "prova de burro".
 *
 * O dado já está aqui. O que faltava era sair na cadência dele.
 *
 * ⚠️ O TEXTO CONTINUA MANUAL, e não é preguiça: automatizar o número mata o
 * trabalho braçal; automatizar a leitura do número mataria o produto que a
 * agência vende. Ela cobra pela análise, não pela planilha.
 */

/** Segunda a domingo; entrega na quarta seguinte. */
const DIAS_ATE_VENCER = 9

export type SituacaoSemana = "entregue" | "pendente" | "vencida"

export type SemanaDaLoja = {
  /** Segunda-feira, ISO. Chave da semana. */
  inicio: string
  fim: string
  vencimento: string
  situacao: SituacaoSemana
  /** Calculado. `null` = a loja não tem dado importado nesse período —
   *  que é diferente de ter vendido zero. */
  bruto: number | null
  pedidos: number | null
  ticketMedio: number | null
  /** Variação contra a semana anterior, em %. `null` quando falta um dos lados. */
  variacaoPct: number | null
  texto: string | null
  entregueEm: string | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** A segunda-feira da semana que contém `d`. */
export function segundaDaSemana(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // getUTCDay: 0=domingo. Queremos recuar até segunda (1).
  const recuo = (x.getUTCDay() + 6) % 7
  x.setUTCDate(x.getUTCDate() - recuo)
  return x
}

const somaDias = (d: Date, n: number) => {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

/**
 * As semanas de uma loja dentro do período selecionado na tela.
 *
 * ── SEGUE O FILTRO, E ISSO É UMA CORREÇÃO ────────────────────────────────
 * A primeira versão ignorava o seletor de período de propósito: a aba
 * pergunta "o que está pendente", e um recorte de dias esconderia semana que
 * a agência ainda deve. O Marcus corrigiu em 28/08/26 — e com razão. Filtro
 * que umas abas obedecem e outras não é pior que qualquer uma das duas
 * regras: quem seleciona agosto e vê julho lê aquilo como defeito, não como
 * intenção, e passa a desconfiar do filtro na tela inteira.
 *
 * A semana entra se ENCOSTA no período. A de 27/07 a 02/08 aparece tanto em
 * julho quanto em agosto, porque ela é das duas — cortá-la ao meio seria
 * inventar uma semana de quatro dias que não existe no ciclo da agência.
 *
 * ⚠️ BUSCA UMA SEMANA A MAIS do que devolve: a variação da mais antiga
 * precisa da anterior a ela. Sem isso a primeira linha sempre apareceria sem
 * comparação, e a pessoa concluiria que faltou dado.
 */
export async function getSemanasDaLoja(
  unitId: string,
  periodo: { start: string; end: string },
  hoje = new Date(),
): Promise<SemanaDaLoja[]> {
  const dentroDoPeriodo = (ini: Date) =>
    iso(ini) <= periodo.end && iso(somaDias(ini, 6)) >= periodo.start

  const segundaAtual = segundaDaSemana(hoje)
  // A semana corrente ainda está aberta — o ciclo só conta a que fechou.
  const ultimaFechada = somaDias(segundaAtual, -7)

  // Começa na segunda do primeiro dia do período e caminha até o fim dele,
  // sem passar da última semana fechada.
  const primeira = segundaDaSemana(new Date(`${periodo.start}T12:00:00Z`))
  const inicios: Date[] = []
  for (let d = new Date(primeira); iso(d) <= periodo.end; d = somaDias(d, 7)) {
    if (iso(d) > iso(ultimaFechada)) break
    if (dentroDoPeriodo(d)) inicios.push(new Date(d))
  }
  // Da mais recente pra trás, que é como se lê uma lista de pendência.
  inicios.reverse()
  // A extra, só pra calcular a variação da última linha — não é devolvida.
  if (inicios.length > 0) {
    inicios.push(somaDias(inicios[inicios.length - 1], -7))
  }
  const quantas = Math.max(0, inicios.length - 1)
  const maisAntigaComExtra = inicios[inicios.length - 1] ?? primeira
  const maisRecente = inicios[0] ?? primeira

  const admin = createAdminClient()
  const [{ data: registros }, agregado] = await Promise.all([
    admin
      .from("relatorio_semanal")
      .select("semana_inicio, texto, entregue_em")
      .eq("unit_id", unitId)
      .gte("semana_inicio", iso(maisAntigaComExtra))
      .lte("semana_inicio", iso(maisRecente)),
    // UMA chamada cobrindo o intervalo inteiro. Pedir semana a semana seriam
    // 9 idas ao banco pra montar uma tela — e a nota de performance do
    // projeto existe justamente por causa desse padrão.
    porSemana(unitId, inicios),
  ])

  const porInicio = new Map(
    ((registros ?? []) as {
      semana_inicio: string
      texto: string | null
      entregue_em: string | null
    }[]).map((r) => [r.semana_inicio, r]),
  )

  const hojeIso = iso(hoje)
  const out: SemanaDaLoja[] = []

  for (let i = 0; i < quantas; i++) {
    const ini = inicios[i]
    const chave = iso(ini)
    const reg = porInicio.get(chave)
    const venc = iso(somaDias(ini, DIAS_ATE_VENCER))

    const atual = agregado.get(chave) ?? null
    const anterior = agregado.get(iso(inicios[i + 1])) ?? null

    out.push({
      inicio: chave,
      fim: iso(somaDias(ini, 6)),
      vencimento: venc,
      situacao: reg?.entregue_em
        ? "entregue"
        : hojeIso > venc
          ? "vencida"
          : "pendente",
      bruto: atual?.bruto ?? null,
      pedidos: atual?.pedidos ?? null,
      ticketMedio:
        atual && atual.pedidos > 0 ? atual.bruto / atual.pedidos : null,
      variacaoPct:
        atual && anterior && anterior.bruto > 0
          ? ((atual.bruto - anterior.bruto) / anterior.bruto) * 100
          : null,
      texto: reg?.texto ?? null,
      entregueEm: reg?.entregue_em ?? null,
    })
  }
  return out
}

/**
 * Bruto e pedidos de cada semana.
 *
 * ⚠️ `null` QUANDO NÃO HÁ DADO, nunca zero. A loja sem integração e a loja
 * que não vendeu produzem o mesmo zero, e tratá-las igual é o defeito que
 * esta base mais repetiu — ver a nota sobre dado parcial silencioso.
 */
async function porSemana(
  unitId: string,
  inicios: Date[],
): Promise<Map<string, { bruto: number; pedidos: number }>> {
  const out = new Map<string, { bruto: number; pedidos: number }>()
  if (inicios.length === 0) return out

  const mapas = await Promise.all(
    inicios.map((ini) =>
      getRealMonthlyForUnitsForRange([unitId], {
        start: iso(ini),
        end: iso(somaDias(ini, 6)),
      }),
    ),
  )

  inicios.forEach((ini, i) => {
    const m = mapas[i].get(unitId)
    if (!m) return
    /* Zero em TUDO = não temos dado da semana; devolve `null` e a tela diz
     * "sem dado importado".
     *
     * ⚠️ É heurística, e prefiro dizer isso a fingir precisão: `UnitMonthly`
     * não carrega um `hasData`, então não dá pra distinguir com certeza a
     * loja que ficou fechada a semana inteira da loja cuja planilha não
     * entrou. As duas caem aqui.
     *
     * O erro que isso evita é o pior dos dois: mandar pro cliente um
     * relatório afirmando R$ 0,00 de faturamento quando ninguém importou
     * nada. Chamar uma semana fechada de "sem dado" custa uma pergunta; o
     * contrário custa credibilidade. */
    if (m.faturamentoBruto <= 0 && m.pedidos <= 0) return
    out.set(iso(ini), { bruto: m.faturamentoBruto, pedidos: m.pedidos })
  })
  return out
}

/** Salva o texto e marca a entrega. O número nunca é gravado. */
export async function salvarRelatorioSemanal(
  unitId: string,
  semanaInicio: string,
  texto: string,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.from("relatorio_semanal").upsert(
    {
      unit_id: unitId,
      semana_inicio: semanaInicio,
      texto,
      entregue_em: texto.trim() ? new Date().toISOString() : null,
      entregue_por: texto.trim() ? userId : null,
    },
    { onConflict: "unit_id,semana_inicio" },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
