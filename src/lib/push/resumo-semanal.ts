/**
 * Resumo da semana por push — só pra quem tem as três plataformas fechadas.
 *
 * Semanal, não diário, por um motivo de dado: o iFood entra sozinho pela API
 * todo dia, mas 99 e Keeta dependem de alguém subir planilha. Em 31/07 o iFood
 * estava no dia 31 e as outras duas no 29 — um resumo "da rede" ali contaria
 * uma plataforma e chamaria de três.
 *
 * Holding com semana incompleta NÃO recebe nada. Silêncio é melhor que um
 * número que parece total e não é.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"

const brl = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`

const dia = (iso: string) => `${Number(iso.slice(8, 10))}`
const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]

export type ResultadoResumo = {
  enviados: { cliente: string; dispositivos: number }[]
  semDado: { cliente: string; faltando: string }[]
  semAssinatura: string[]
}

export async function enviarResumoSemanal(): Promise<ResultadoResumo> {
  const out: ResultadoResumo = { enviados: [], semDado: [], semAssinatura: [] }
  const admin = createAdminClient()

  // Semana anterior fechada: segunda a domingo. Roda na segunda de manhã.
  const hoje = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  )
  const fim = new Date(hoje)
  fim.setDate(fim.getDate() - hoje.getDay() || -7) // domingo passado
  const ini = new Date(fim)
  ini.setDate(ini.getDate() - 6)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const { data: holdings } = await admin
    .from("holdings")
    .select("id, name")
    .eq("conta_interna", false)

  for (const h of (holdings ?? []) as { id: string; name: string }[]) {
    const { data } = await admin.rpc("resumo_semanal", {
      p_holding: h.id,
      p_ini: iso(ini),
      p_fim: iso(fim),
    })
    const r = (data ?? [])[0] as
      | {
          bruto: number | string
          pedidos: number
          completo: boolean
          faltando: string | null
          loja_destaque: string | null
          variacao_pct: number | string | null
        }
      | undefined
    if (!r) continue

    // Semana incompleta ou sem movimento: não manda nada.
    if (!r.completo) {
      out.semDado.push({ cliente: h.name, faltando: r.faltando ?? "?" })
      continue
    }
    if (Number(r.pedidos) === 0) continue

    // Quem recebe: todo mundo com acesso à holding que tenha aparelho ativo.
    const { data: acessos } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("holding_id", h.id)
      .is("invalid_since", null)
    const userIds = [
      ...new Set(((acessos ?? []) as { user_id: string }[]).map((a) => a.user_id)),
    ]
    if (userIds.length === 0) {
      out.semAssinatura.push(h.name)
      continue
    }

    const queda =
      r.loja_destaque && Number(r.variacao_pct) <= -15
        ? ` ${r.loja_destaque} caiu ${Math.abs(Number(r.variacao_pct))}% — vale olhar.`
        : ""

    const res = await enviarPush(userIds, {
      titulo: `Sua semana · ${dia(iso(ini))} a ${dia(iso(fim))} de ${MES[fim.getMonth()]}`,
      corpo: `${brl(Number(r.bruto))} · ${Number(r.pedidos).toLocaleString("pt-BR")} pedidos nas 3 plataformas.${queda}`,
      url: "/inicio",
      // Mesmo `tag` = a semana nova substitui a anterior na tela de bloqueio,
      // em vez de empilhar resumos velhos que ninguém vai ler.
      tag: "resumo-semanal",
    })
    out.enviados.push({ cliente: h.name, dispositivos: res.enviados })
  }

  return out
}
