import "server-only"

/**
 * Coletor de extratos do iFood — garante que o financeiro do dia ENTRE.
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────
 * O extrato (Reconciliation On Demand) é assíncrono: pede → o iFood gera →
 * baixa. O sync diário espera até 150s POR loja/competência, e com 74 lojas ×
 * 2 competências isso não cabe na janela de 300s: em 15/08/26 ele disparou 148
 * pedidos às 06:01 e gravou ZERO linha. O estrago aparecia no número que o
 * cliente vê — 55 das 86 lojas com o financeiro de agosto parado há 2 dias ou
 * mais, algumas há uma semana.
 *
 * ── MEDIDO, NÃO SUPOSTO ───────────────────────────────────────────────────
 * Perguntando o status cru ao iFood (scripts/diag-extrato-status.ts): os
 * pedidos das 06:01 ainda estavam **"enqueued" 74 minutos depois**. Um de
 * ontem, com 922 minutos, estava "processed". Ou seja: eles FICAM prontos, só
 * que a fila deles pode levar horas.
 *
 * Isso decide o desenho: **não adianta esperar, tem que voltar.** Esperar é o
 * que o sync diário já fazia — e é o que não funciona quando a espera é medida
 * em horas.
 *
 * ── DUAS FASES, PRA NINGUÉM FICAR PRA TRÁS ────────────────────────────────
 * A primeira versão gastava a rodada inteira nos primeiros da fila e nunca
 * alcançava o resto (11 de 170, sempre os mesmos). Agora:
 *
 *   1. VARRE a fila inteira perguntando só o status — barato, sem baixar nada.
 *      Quem ainda não tem pedido, pede e segue em frente.
 *   2. BAIXA apenas os que voltaram "processed".
 *
 * Assim nenhuma loja fica presa atrás de outra, e o tempo caro (download +
 * parse) só é gasto em arquivo que existe.
 *
 * ── A FILA É ESTADO, NÃO EVENTO ───────────────────────────────────────────
 * A fila é "quem está sem financeiro fresco hoje", não "o que eu pedi". A
 * primeira versão lia a tabela de `requestId` e, no primeiro teste, apagou 5
 * pedidos válidos: pedido que estourava o tempo saía da tabela e a loja nunca
 * mais era tentada no dia. Fila de estado sobrevive a reinício, a deploy, a
 * pedido perdido e a id morto — mesma lição do backfill, um dia antes.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"
import { inicioDoDiaBR } from "@/lib/dia-br"
import {
  getReconciliationRequest,
  pedidosVigentes,
  requestReconciliation,
  competenciasVazias,
  marcarCompetenciaVazia,
  esquecerPedido,
} from "./reconciliation"
import { syncReconciliationCompetencia } from "./sync"

/** Margem pra rodada terminar antes da seguinte começar. */
const RESERVA_FINAL_MS = 25_000

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export type ResultadoColeta = {
  naFila: number
  /** Lojas puladas por 403 recente — ver `MERCHANTS_EM_QUARENTENA`. */
  emQuarentena: number
  /** Perguntamos o status de quantos nesta rodada. */
  conferidos: number
  /** Pedidos abertos agora (não havia extrato em geração). */
  pedidosNovos: number
  prontos: number
  coletados: { loja: string; competencia: string; linhas: number }[]
  aindaGerando: number
  /** Competências em que o iFood confirmou que a loja não vendeu. */
  semMovimento: number
  falhas: { loja: string; competencia: string; erro: string }[]
  /** Prontos que não couberam nesta rodada — vão na próxima. */
  aBaixar: number
}

type Loja = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
}

export async function coletarExtratosPendentes(
  opts: { deadlineMs?: number } = {},
): Promise<ResultadoColeta> {
  const t0 = Date.now()
  const limite = opts.deadlineMs ?? 260_000
  const admin = createAdminClient()

  const agora = new Date()
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
  // Mês corrente primeiro: é o que o cliente olha hoje. O anterior ainda
  // recebe ajuste do iFood depois de virado (comissão atrasada, reembolso).
  const competencias = [ym(agora), ym(anterior)]

  // ⚠️ A MESMA EXCLUSÃO DO SYNC DIÁRIO, e não uma lista própria.
  //
  // Sem ela o coletor tentava as 10 lojas da conta DEMO (merchants fictícios,
  // que o iFood responde com 403) e produzia 22 falhas por rodada — a cada 4
  // minutos, pra sempre. Ruído desse tipo é o que faz um relatório de erro
  // deixar de ser lido.
  const [{ data: vinculos }, foraDoSync] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("api_store_id, units!inner(id, code, name, active)")
      .eq("platform", "ifood")
      .eq("active", true)
      .not("api_store_id", "is", null),
    idsDeUnidadesForaDoSync(),
  ])

  const lojas: Loja[] = ((vinculos ?? []) as unknown as {
    api_store_id: string
    units: { id: string; code: string; name: string; active: boolean }
  }[])
    .filter((v) => v.units?.active && !foraDoSync.has(v.units.id))
    .map((v) => ({
      unitId: v.units.id,
      unitCode: v.units.code,
      unitName: v.units.name,
      merchantId: v.api_store_id,
    }))

  // Quem JÁ recebeu financeiro hoje sai da fila.
  //
  // Lê de `platform_imports` (uma linha por importação) e não da tabela de
  // lançamentos: aquela tem milhões de linhas, e um group-by nela a cada 4
  // minutos seria custo fixo pra responder uma pergunta pequena.
  // ⚠️ Virada do dia em BRASÍLIA — ver src/lib/dia-br.ts. Com a virada em UTC
  // (o fuso da Vercel), "hoje" começava às 21h da véspera: as 74 lojas
  // recarregavam de madrugada e o coletor passava o dia inteiro ocioso,
  // achando que já tinha trabalhado.
  const hoje = inicioDoDiaBR(agora)
  const { data: fresco } = await admin
    .from("platform_imports")
    .select("unit_id, ref_year, ref_month")
    .eq("platform", "ifood")
    .eq("report_type", "financeiro")
    .eq("status", "success")
    .gte("imported_at", hoje)

  const jaVeioHoje = new Set(
    ((fresco ?? []) as { unit_id: string; ref_year: number; ref_month: number }[])
      .filter((r) => r.ref_year && r.ref_month)
      .map(
        (r) => `${r.unit_id}|${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`,
      ),
  )

  const fila: { loja: Loja; competencia: string }[] = []
  for (const c of competencias) {
    for (const loja of lojas) {
      if (!jaVeioHoje.has(`${loja.unitId}|${c}`)) fila.push({ loja, competencia: c })
    }
  }

  const out: ResultadoColeta = {
    naFila: fila.length,
    emQuarentena: 0,
    conferidos: 0,
    pedidosNovos: 0,
    prontos: 0,
    coletados: [],
    aindaGerando: 0,
    semMovimento: 0,
    falhas: [],
    aBaixar: 0,
  }
  if (fila.length === 0) return out

  /**
   * ⚠️ QUARENTENA DE 403 — loja sem permissão não pode ser martelada.
   *
   * A cota do iFood é POR APLICAÇÃO, confirmado por eles: chamada gasta numa
   * loja é chamada tirada de todas as outras. Em 15/08/26 a Pizzaria Quero
   * Mais devolveu 403 em 394 chamadas num único dia — este coletor batendo
   * nela de 4 em 4 minutos, sem nunca desistir. No mesmo dia apareceram os
   * primeiros 429 do sistema, e o JK e o Restaurante Cardeal ficaram sem os
   * pedidos do dia por causa disso.
   *
   * 403 não se resolve tentando de novo: é permissão, e muda no portal do
   * iFood, não aqui. Quem levou 403 nas últimas 6h sai da rodada — e aparece
   * na contagem, pra não sumir em silêncio.
   */
  const desde403 = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data: bloqueados } = await admin
    .from("ifood_api_logs")
    .select("merchant_id")
    .eq("response_status", 403)
    .gte("created_at", desde403)
    .not("merchant_id", "is", null)
  const quarentena = new Set(
    ((bloqueados ?? []) as { merchant_id: string }[]).map((b) => b.merchant_id),
  )

  // Quem já tem extrato em geração — evita um SELECT por item na varredura.
  const vigentes = new Map<string, string>()
  for (const p of await pedidosVigentes()) {
    vigentes.set(`${p.merchantId}|${p.competencia}`, p.requestId)
  }

  /**
   * Competências que o iFood já confirmou VAZIAS não voltam pra fila.
   *
   * Ele responde "No financial entries exist ... in the requested time frame"
   * quando a loja não vendeu no período — mês anterior à inauguração, por
   * exemplo. Isso é definitivo, não transitório: pedir de novo daqui a quatro
   * minutos dá exatamente a mesma resposta. Como o teto de chamadas do iFood é
   * por APLICATIVO, insistir aqui rouba banda de todas as outras lojas.
   */
  const vazias = await competenciasVazias()

  // ── FASE 1: varredura de status (barata) ────────────────────────────────
  const prontos: { loja: Loja; competencia: string }[] = []
  for (const item of fila) {
    if (Date.now() - t0 > limite * 0.6) break
    if (quarentena.has(item.loja.merchantId)) {
      out.emQuarentena++
      continue
    }
    const chave = `${item.loja.merchantId}|${item.competencia}`
    if (vazias.has(chave)) {
      out.semMovimento++
      continue
    }
    const requestId = vigentes.get(chave)
    out.conferidos++

    try {
      if (!requestId) {
        // Sem extrato em geração: pede e SEGUE. Ele fica pronto quando ficar;
        // quem recolhe é a rodada seguinte.
        const r = await requestReconciliation(item.loja.merchantId, item.competencia)
        if (r.ok) out.pedidosNovos++
        else {
          out.falhas.push({
            loja: `${item.loja.unitCode} ${item.loja.unitName}`,
            competencia: item.competencia,
            erro: r.error ?? `HTTP ${r.status}`,
          })
        }
        continue
      }

      const st = await getReconciliationRequest(item.loja.merchantId, requestId)
      const s = (st.data?.status ?? "").toLowerCase()
      if (st.ok && s === "processed") {
        prontos.push(item)
      } else if (/no financial entries exist/i.test(st.raw ?? "")) {
        // Definitivo: encerra a competência aqui e nunca mais pede.
        await marcarCompetenciaVazia(item.loja.merchantId, item.competencia)
        await esquecerPedido(item.loja.merchantId, item.competencia)
        out.semMovimento++
      } else {
        out.aindaGerando++
      }
    } catch (e) {
      out.falhas.push({
        loja: `${item.loja.unitCode} ${item.loja.unitName}`,
        competencia: item.competencia,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  out.prontos = prontos.length

  // ── FASE 2: baixa só o que está pronto ──────────────────────────────────
  let baixados = 0
  for (const item of prontos) {
    if (Date.now() - t0 > limite - RESERVA_FINAL_MS) break
    baixados++
    const loja = `${item.loja.unitCode} ${item.loja.unitName}`
    try {
      const r = await syncReconciliationCompetencia(
        item.loja,
        item.competencia,
        // `force`: o throttle de 6h serve pra não PEDIR de novo, e aqui o
        // arquivo já está pronto. Quem controla a repetição é a fila.
        true,
        admin,
        // O arquivo existe: 20s é folga de sobra pro download começar.
        // `esquecerNoTimeout: false` porque tempo esgotado aqui é acidente de
        // rede, não id morto — jogar o pedido fora seria destruir o trabalho
        // que este coletor existe pra recolher.
        { maxWaitMs: 20_000, esquecerNoTimeout: false },
      )
      if (r.ok) {
        out.coletados.push({
          loja,
          competencia: item.competencia,
          linhas: r.persisted ?? 0,
        })
      } else if (!r.pendente) {
        out.falhas.push({
          loja,
          competencia: item.competencia,
          erro: r.error ?? "erro sem mensagem",
        })
      }
    } catch (e) {
      out.falhas.push({
        loja,
        competencia: item.competencia,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  out.aBaixar = prontos.length - baixados
  return out
}
