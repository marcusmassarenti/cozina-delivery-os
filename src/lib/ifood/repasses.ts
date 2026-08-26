import "server-only"

/**
 * O repasse do iFood por CICLO, com a data em que o dinheiro caiu de verdade.
 *
 * ── POR QUE ISTO EXISTE (Marcus, 26/08/26) ───────────────────────────────
 * "os valores precisam bater exatamente". A tela de fechamento mostrava
 * R$ 20.915,66 onde o banco recebeu R$ 21.002,81, e a causa não era uma só:
 *
 *  1. Reconstruíamos o repasse somando lançamento de PEDIDO. Repasse é um fato
 *     próprio, com ciclo e data próprios — reconstruí-lo nunca vai fechar.
 *  2. `ifood_financeiro_lancamentos.data_repasse_esperada` guarda o calendário
 *     ORIGINAL. Quem antecipa recebe semanas antes: o ciclo 17–23/08 da JK
 *     tinha data prevista 16/09 e caiu em 26/08.
 *  3. A taxa de antecipação não existe no extrato.
 *
 * ⚠️ A API DE SETTLEMENTS NÃO SERVE PRA ISSO, e é a armadilha óbvia: ela tem
 * `paymentDate` e parece a fonte certa. Testada em 26/08/26 na JK, ela devolve
 * R$ 17.430,56 pra data 26/08 — o mesmo do nosso extrato, ou seja, o calendário
 * ORIGINAL. Quem sabe a data real é a API de ANTECIPAÇÕES.
 *
 * Conferido ao centavo na JK, ciclo 17–23/08:
 *   14.277,58 + 7.042,91 = 21.320,49 bruto · taxa 317,68 (1,49%) · 21.002,81
 * idêntico ao portal E ao extrato bancário.
 *
 * Espelha `keeta_repasses`, que já resolvia o mesmo problema do lado da Keeta.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getAnticipations } from "./anticipations"
import { getSettlements } from "./settlements"

/**
 * ⚠️ JANELA MÁXIMA DE ~31 DIAS, E ESTOURAR NÃO DÁ ERRO.
 *
 * Medido em 26/08/26 na JK: `01/07 → 26/08` devolve **HTTP 200 com zero
 * itens**. `01/07 → 31/07` e `01/08 → 26/08` devolvem os itens normalmente.
 * Não há mensagem, não há status diferente — a resposta vazia é
 * indistinguível de "esta loja não antecipou nada no período".
 *
 * Foi exatamente assim que a primeira versão desta função devolveu
 * `ciclos: 0` sem reclamar. Por isso o intervalo é fatiado aqui, e não na
 * mão de quem chama: quem chama não tem como saber do limite.
 */
const MAX_DIAS_JANELA = 31

function fatiar(de: string, ate: string): [string, string][] {
  const out: [string, string][] = []
  const fim = new Date(`${ate}T00:00:00`)
  let ini = new Date(`${de}T00:00:00`)
  while (ini <= fim) {
    const p = new Date(ini)
    p.setDate(p.getDate() + MAX_DIAS_JANELA - 1)
    const pFim = p > fim ? fim : p
    out.push([ini.toISOString().slice(0, 10), pFim.toISOString().slice(0, 10)])
    ini = new Date(pFim)
    ini.setDate(ini.getDate() + 1)
  }
  return out
}

export type ResultadoRepasses = {
  merchantId: string
  ciclos: number
  antecipados: number
  erro?: string
}

/**
 * ⚠️ SÓ O SALDO FECHADO CONTA COMO DINHEIRO DO CICLO.
 *
 * A Settlements devolve o MESMO valor em três roupagens: `SALDO POSITIVO`
 * (o saldo do ciclo), `REPASSE`/`RENEGOCIADA` (como ele foi entregue) e
 * `REGISTRO_RECEBIVEIS` (o registro do recebível). Somar tudo triplica —
 * medido na JK: 17.430,56 aparecendo três vezes.
 *
 * Só o SALDO é o ciclo. `CLOSED` porque saldo aberto ainda muda.
 */
const SALDO_FECHADO = (tipo?: string, status?: string) =>
  (tipo === "SALDO POSITIVO" || tipo === "SALDO NEGATIVO") &&
  status === "CLOSED"

/** Sinal certo: SALDO NEGATIVO já vem negativo na API, mas não custa garantir. */
const comSinal = (tipo: string | undefined, v: number) =>
  tipo === "SALDO NEGATIVO" ? -Math.abs(v) : v

type Linha = {
  unit_id: string
  merchant_id: string
  ciclo_inicio: string
  ciclo_fim: string
  tipo: string | null
  status: string | null
  valor_bruto: number
  taxa_antecipacao: number
  valor_liquido: number
  data_prevista: string | null
  data_pagamento: string | null
}

/**
 * Traz os repasses de uma loja num intervalo de APURAÇÃO (não de pagamento:
 * é a apuração que define o ciclo, e é por ela que as duas APIs cortam).
 *
 * Regrava por (merchant, ciclo) em vez de fazer upsert: as duas APIs podem
 * devolver quantidades diferentes de itens pro mesmo ciclo conforme ele fecha,
 * e chave natural aqui é frágil. Apagar e reinserir é idempotente e não deixa
 * item órfão de uma leitura anterior.
 */
export async function sincronizarRepassesIfood(
  unitId: string,
  merchantId: string,
  de: string,
  ate: string,
): Promise<ResultadoRepasses> {
  const admin = createAdminClient()
  const porCiclo = new Map<string, Linha>()

  const fatias = fatiar(de, ate)
  let antecipados = 0

  // 1) ANTECIPAÇÕES primeiro: quem antecipa tem a data real só aqui.
  for (const [fDe, fAte] of fatias) {
    const anti = await getAnticipations(merchantId, fDe, fAte)
    if (!anti.ok) {
      return {
        merchantId,
        ciclos: 0,
        antecipados: 0,
        erro: anti.error ?? `HTTP ${anti.status}`,
      }
    }
    for (const p of anti.data?.settlements ?? []) {
      const ini = p.startDateCalculation?.slice(0, 10)
      const fim = p.endDateCalculation?.slice(0, 10)
      if (!ini || !fim) continue
      for (const it of p.closingItems ?? []) {
        const chave = `${ini}|${fim}`
        const atual = porCiclo.get(chave)
        const bruto = Number(it.originalPaymentAmount ?? 0)
        const taxa = Number(it.feeAmount ?? 0)
        const liq = Number(it.anticipatedPaymentAmount ?? 0)
        antecipados++
        porCiclo.set(chave, {
          unit_id: unitId,
          merchant_id: merchantId,
          ciclo_inicio: ini,
          ciclo_fim: fim,
          tipo: it.type ?? atual?.tipo ?? null,
          status: it.status ?? atual?.status ?? null,
          valor_bruto: (atual?.valor_bruto ?? 0) + bruto,
          taxa_antecipacao: (atual?.taxa_antecipacao ?? 0) + taxa,
          valor_liquido: (atual?.valor_liquido ?? 0) + liq,
          data_prevista:
            it.originalPaymentDate?.slice(0, 10) ??
            atual?.data_prevista ??
            null,
          data_pagamento:
            it.anticipatedPaymentDate?.slice(0, 10) ??
            atual?.data_pagamento ??
            null,
        })
      }
    }
  }

  // 2) SETTLEMENTS pros ciclos que NÃO foram antecipados. Aqui a data prevista
  //    é a data real, porque não houve antecipação pra deslocar nada.
  for (const [fDe, fAte] of fatias) {
    const set = await getSettlements(merchantId, fDe, fAte, "calculo")
    if (set.ok) {
      for (const p of set.data?.settlements ?? []) {
        const ini = p.startDateCalculation?.slice(0, 10)
        const fim = p.endDateCalculation?.slice(0, 10)
        if (!ini || !fim) continue
        const chave = `${ini}|${fim}`
        if (porCiclo.has(chave)) continue // antecipado: a data boa é a de cima
        for (const it of p.closingItems ?? []) {
          if (!SALDO_FECHADO(it.type, it.status)) continue
          const v = comSinal(it.type, Number(it.amount ?? 0))
          const atual = porCiclo.get(chave)
          porCiclo.set(chave, {
            unit_id: unitId,
            merchant_id: merchantId,
            ciclo_inicio: ini,
            ciclo_fim: fim,
            tipo: it.type ?? null,
            status: it.status ?? null,
            valor_bruto: (atual?.valor_bruto ?? 0) + v,
            taxa_antecipacao: 0,
            valor_liquido: (atual?.valor_liquido ?? 0) + v,
            data_prevista:
              it.paymentDate?.slice(0, 10) ?? atual?.data_prevista ?? null,
            data_pagamento:
              it.paymentDate?.slice(0, 10) ?? atual?.data_pagamento ?? null,
          })
        }
      }
    }
  }

  const linhas = [...porCiclo.values()]
  if (linhas.length === 0) return { merchantId, ciclos: 0, antecipados: 0 }

  await admin
    .from("ifood_repasses")
    .delete()
    .eq("merchant_id", merchantId)
    .gte("ciclo_inicio", de)
    .lte("ciclo_inicio", ate)
  const { error } = await admin.from("ifood_repasses").insert(linhas)
  if (error)
    return { merchantId, ciclos: 0, antecipados: 0, erro: error.message }

  return { merchantId, ciclos: linhas.length, antecipados }
}
