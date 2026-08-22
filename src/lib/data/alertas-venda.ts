/**
 * Lojas que estão vendendo menos do que elas mesmas vendiam.
 *
 * ── POR QUE (Marcus, 22/08/26) ───────────────────────────────────────────
 * O sistema sabia dizer "o dado chegou" e nunca "a venda caiu". O gestor só
 * descobria fechando o mês — quando já não dava pra fazer nada sobre aquele
 * mês.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO ──────────────────────────────
 * Não mede contra meta nem contra a média da rede. Loja compara com ELA MESMA,
 * porque é a única referência que sobrevive a bairro, tamanho, cardápio e
 * sazonalidade. "Caiu 50% contra ela mesma" é acionável; "está abaixo da média
 * da rede" é sobre a rede, não sobre ela.
 *
 * A conta mora na RPC `alertas_venda` (ver migration 0226): 7 dias contra a
 * média semanal das 4 semanas anteriores, ancorada no último dia com dado
 * DAQUELA loja. A âncora por loja é o que separa "parou de vender" de "o dado
 * ainda não chegou" — sem ela, loja com importação atrasada apareceria como
 * loja que fechou as portas.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesDemo } from "@/lib/data/holding-demo"
import { idsDeUnidadesEncerradas } from "@/lib/data/unidades-encerradas"

export type EstadoVenda =
  | "parou"
  | "caiu"
  | "ok"
  | "baixo-volume"
  /** Uma plataforma relevante está com o dado parado — não dá pra opinar. */
  | "dado-incompleto"

export type AlertaVenda = {
  unitId: string
  cliente: string
  code: string
  loja: string
  estado: EstadoVenda
  /** Último dia com dado desta loja — a base da comparação. */
  ancora: string
  pedidosRecentes: number
  /** Média semanal das 4 semanas anteriores. */
  pedidosBase: number
  quedaPct: number
  /** Pedidos a menos na semana — o número que dói, em unidade que se entende. */
  pedidosAMenos: number
  /** Plataformas com dado parado: quem, há quantos dias, e que fatia era. */
  defasadas: PlataformaDefasada[]
}

export type PlataformaDefasada = {
  plat: string
  dias: number
  /** Fatia do movimento da loja que essa plataforma representava (0–1). */
  peso: number
}

/**
 * Dias de atraso que ainda são ROTINA em cada plataforma.
 *
 * ── POR QUE ISTO NÃO MORA NA RPC (Marcus, 22/08/26) ──────────────────────
 * A função responde "dá pra julgar a venda?" — e ali qualquer buraco de mais
 * de 3 dias invalida a janela de 7, independente de ser normal. Já "isso
 * merece um aviso?" depende da cadência: a Keeta entra por planilha semanal,
 * então 5 dias ali é rotina; no iFood, que é diário, 5 dias é problema.
 *
 * Usar o limiar técnico pra avisar produziria 23 lojas em alerta permanente —
 * e alerta permanente ninguém lê. É a mesma folga da procedência
 * (@/lib/data/procedencia), pelo mesmo motivo.
 */
const CADENCIA_DIAS: Record<string, number> = {
  iFood: 3,
  "99 Food": 5,
  Keeta: 7,
  "Cardapio Web": 3,
}

/** Só o que passou da cadência da própria plataforma. */
export function defasagensQueImportam(
  defasadas: PlataformaDefasada[],
): PlataformaDefasada[] {
  return defasadas.filter((d) => d.dias > (CADENCIA_DIAS[d.plat] ?? 3))
}

/**
 * @param piso pedidos/semana abaixo dos quais a porcentagem não significa nada
 * @param quedaPct queda mínima para virar alerta
 */
export async function alertasDeVenda(
  piso = 7,
  quedaPct = 40,
): Promise<AlertaVenda[]> {
  const admin = createAdminClient()

  const [{ data, error }, demo, encerradas] = await Promise.all([
    admin.rpc("alertas_venda", {
      p_piso_semanal: piso,
      p_queda_pct: quedaPct,
    }),
    idsDeUnidadesDemo(),
    idsDeUnidadesEncerradas(),
  ])
  if (error) {
    console.error("alertas_venda:", error.message)
    return []
  }

  const linhas = ((data ?? []) as {
    unit_id: string
    ancora: string
    pedidos_recentes: number
    pedidos_base: number
    queda_pct: number
    estado: EstadoVenda
    defasadas: PlataformaDefasada[] | null
  }[]).filter(
    (l) =>
      (l.estado === "parou" ||
        l.estado === "caiu" ||
        l.estado === "dado-incompleto") &&
      // A demo tem venda fabricada e para sempre que o seed envelhece; cliente
      // encerrado parou de propósito. Os dois entupiriam a lista com alarme
      // que ninguém vai agir.
      !demo.has(l.unit_id) &&
      !encerradas.has(l.unit_id),
  )
  if (linhas.length === 0) return []

  const { data: uns } = await admin
    .from("units")
    .select("id, code, name, active, brands!inner(holdings!inner(name))")
    .in("id", linhas.map((l) => l.unit_id))

  const info = new Map<string, { code: string; loja: string; cliente: string }>()
  for (const u of (uns ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
    brands: { holdings: { name: string } }
  }[]) {
    if (!u.active) continue
    info.set(u.id, {
      code: u.code,
      loja: u.name,
      cliente: u.brands?.holdings?.name ?? "—",
    })
  }

  return linhas
    .flatMap((l) => {
      const i = info.get(l.unit_id)
      if (!i) return []
      return [
        {
          unitId: l.unit_id,
          ...i,
          estado: l.estado,
          ancora: l.ancora,
          pedidosRecentes: Number(l.pedidos_recentes),
          pedidosBase: Number(l.pedidos_base),
          quedaPct: Number(l.queda_pct),
          pedidosAMenos: Math.max(
            0,
            Math.round(Number(l.pedidos_base) - Number(l.pedidos_recentes)),
          ),
          defasadas: l.defasadas ?? [],
        },
      ]
    })
    // Ordena pelo TAMANHO da perda, não pela porcentagem: 100 pedidos a menos
    // numa loja grande importa mais que 80% a menos numa que fazia 10.
    .sort((a, b) => b.pedidosAMenos - a.pedidosAMenos)
}
