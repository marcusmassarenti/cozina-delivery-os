import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  getFinanceiroResumoByUnitsForRange,
  getRealMonthlyForUnitsForRange,
} from "./range-aggregation"
import { segundaDaSemana } from "./relatorio-semanal"

/**
 * A carteira da agência — quem cuida do quê, e quanto cada um traz.
 *
 * ⚠️ TUDO AQUI É POR HOLDING. Gestor, carteira e ranking são da agência, e
 * misturar a carteira de dois clientes é o erro mais caro que este sistema
 * pode cometer — o mesmo que a tela de merchants cometeu e que custou uma
 * manhã pra consertar em 28/08/26.
 */

export type Gestor = {
  id: string
  nome: string
  ativo: boolean
  temLogin: boolean
}

export type GestorNoRanking = Gestor & {
  lojas: number
  lojasAtivas: number
  /** Faturamento da carteira dele no período — COM canceladas, régua do portal. */
  bruto: number
  /**
   * Cesta dos pedidos cancelados no período.
   *
   * ⚠️ SÓ iFOOD. É a única plataforma que informa a perda por cancelamento;
   * 99, Keeta e Cardápio Web não mandam esse número. Por isso a tela chama o
   * que sobra de "sem canceladas do iFood" e não de "venda válida" — dizer a
   * segunda coisa seria prometer uma precisão que não existe.
   */
  canceladas: number
  pedidos: number
  pedidosCancelados: number
  /** Média de dias que as lojas dele estão na carteira. `null` sem data. */
  diasMedios: number | null
  /** Semanas fechadas sem comentário — mede o TRABALHO, não só o resultado. */
  semanasPendentes: number
}

export async function listarGestores(holdingId?: string): Promise<Gestor[]> {
  const hid = holdingId ?? (await getCurrentHoldingId())
  if (!hid) return []
  const { data } = await createAdminClient()
    .from("gestores")
    .select("id, nome, ativo, user_id")
    .eq("holding_id", hid)
    .order("nome")
  return ((data ?? []) as {
    id: string
    nome: string
    ativo: boolean
    user_id: string | null
  }[]).map((g) => ({
    id: g.id,
    nome: g.nome,
    ativo: g.ativo,
    temLogin: g.user_id !== null,
  }))
}

/**
 * O ranking de gestores no período.
 *
 * ⚠️ INCLUI O GESTOR SEM NENHUMA LOJA. Ele existe na agência e some do
 * ranking se a consulta partir das lojas — e some justamente quem precisa
 * aparecer, porque carteira vazia é informação, não ausência de informação.
 * No painel do Diego o "Daniel" aparece com R$ 0,00 e 3 lojas; some-lo seria
 * esconder que alguém está sem produzir.
 */
export async function rankingDeGestores(
  periodo: { start: string; end: string },
  holdingId?: string,
): Promise<GestorNoRanking[]> {
  const hid = holdingId ?? (await getCurrentHoldingId())
  if (!hid) return []
  const admin = createAdminClient()

  const [gestores, { data: lojasRaw }] = await Promise.all([
    listarGestores(hid),
    admin
      .from("units")
      .select("id, gestor_id, active, entrada_carteira, brands!inner(holding_id)")
      .eq("brands.holding_id", hid)
      .not("gestor_id", "is", null),
  ])
  if (gestores.length === 0) return []

  const lojas = (lojasRaw ?? []) as unknown as {
    id: string
    gestor_id: string
    active: boolean
    entrada_carteira: string | null
  }[]

  const idsDeTodas = lojas.map((l) => l.id)
  /* A perda por cancelamento vem do EXTRATO do iFood, não do agregador.
   *
   * `UnitMonthly.cancelamentosReembolsos` existe, mas é alimentado só pelo
   * lançamento MANUAL — e esse campo está zerado nas 239 linhas da base
   * inteira. Ler dali daria um botão que acende e não move número nenhum, o
   * pior tipo de controle num painel: parece que respondeu. O valor de
   * verdade mora no resumo financeiro (a JK perdeu R$ 845,96 em ago/26), que
   * é a mesma fonte que o DRE usa pra abrir "Vendas totais − cancelados". */
  const [faturamento, financeiro, pendentes] = await Promise.all([
    idsDeTodas.length > 0
      ? getRealMonthlyForUnitsForRange(idsDeTodas, periodo)
      : Promise.resolve(new Map()),
    idsDeTodas.length > 0
      ? getFinanceiroResumoByUnitsForRange(idsDeTodas, periodo)
      : Promise.resolve(new Map()),
    semanasPendentesPorLoja(idsDeTodas),
  ])

  const hoje = Date.now()
  return gestores
    .map((g) => {
      const minhas = lojas.filter((l) => l.gestor_id === g.id)
      const comData = minhas.filter((l) => l.entrada_carteira)
      const soma = minhas.reduce(
        (acc, l) => {
          const m = faturamento.get(l.id)
          if (m) {
            acc.bruto += m.faturamentoBruto
            acc.pedidos += m.pedidos
            acc.pedidosCancelados += m.pedidosCancelados
          }
          const f = financeiro.get(l.id)
          // Vem NEGATIVA no extrato; aqui é grandeza, igual ao merge da tela
          // da loja.
          if (f) acc.canceladas += Math.abs(f.perdaCancelamento)
          acc.pendentes += pendentes.get(l.id) ?? 0
          return acc
        },
        { bruto: 0, canceladas: 0, pedidos: 0, pedidosCancelados: 0, pendentes: 0 },
      )
      return {
        ...g,
        lojas: minhas.length,
        lojasAtivas: minhas.filter((l) => l.active).length,
        bruto: soma.bruto,
        canceladas: soma.canceladas,
        pedidos: soma.pedidos,
        pedidosCancelados: soma.pedidosCancelados,
        diasMedios:
          comData.length === 0
            ? null
            : Math.round(
                comData.reduce(
                  (a, l) =>
                    a +
                    (hoje - new Date(`${l.entrada_carteira}T12:00:00Z`).getTime()) /
                      86400000,
                  0,
                ) / comData.length,
              ),
        semanasPendentes: soma.pendentes,
      }
    })
    .sort((a, b) => b.bruto - a.bruto)
}

/**
 * Quantas semanas FECHADAS cada loja tem sem comentário.
 *
 * Olha as últimas 8 semanas. Ir mais fundo faria toda loja nova nascer com
 * dezenas de pendências herdadas de antes de existir o ciclo — e alarme que
 * já começa vermelho ninguém olha.
 */
async function semanasPendentesPorLoja(
  unitIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (unitIds.length === 0) return out

  const segundaAtual = segundaDaSemana(new Date())
  const inicios: string[] = []
  for (let i = 1; i <= 8; i++) {
    const d = new Date(segundaAtual)
    d.setUTCDate(d.getUTCDate() - 7 * i)
    inicios.push(d.toISOString().slice(0, 10))
  }

  const { data } = await createAdminClient()
    .from("relatorio_semanal")
    .select("unit_id, semana_inicio")
    .in("unit_id", unitIds)
    .in("semana_inicio", inicios)
    .not("entregue_em", "is", null)

  const feitas = new Map<string, Set<string>>()
  for (const r of (data ?? []) as { unit_id: string; semana_inicio: string }[]) {
    const s = feitas.get(r.unit_id) ?? new Set()
    s.add(r.semana_inicio)
    feitas.set(r.unit_id, s)
  }
  for (const id of unitIds) {
    out.set(id, inicios.length - (feitas.get(id)?.size ?? 0))
  }
  return out
}
