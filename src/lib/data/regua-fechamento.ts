/**
 * Régua do fechamento: um e-mail por mês, e só pra quem tem buraco.
 *
 * Roda dentro do cron da régua (o plano só permite um cron por dia, e criar
 * outro não caberia). Sai no dia 3 — dois dias de folga pra quem fecha na
 * virada, e ainda antes de a pessoa olhar o resultado do mês e tirar conclusão
 * de um número incompleto.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEmail } from "@/lib/email/enviar"
import { fechamentoIncompleto } from "@/lib/email/templates"
import { contatoDaHolding } from "@/lib/email/contato-holding"
import {
  DIA_DO_ENVIO,
  getFechamentosIncompletos,
} from "@/lib/data/fechamento-mes"

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export type ResultadoFechamento = {
  rodou: boolean
  motivo?: string
  enviados: string[]
  semContato: string[]
}

export async function rodarReguaFechamento(): Promise<ResultadoFechamento> {
  const out: ResultadoFechamento = { rodou: false, enviados: [], semContato: [] }

  // Data em Brasília: na Vercel (UTC) o cron da madrugada cairia no dia errado.
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  )
  if (agora.getDate() !== DIA_DO_ENVIO) {
    out.motivo = `hoje é dia ${agora.getDate()}, o envio é no dia ${DIA_DO_ENVIO}`
    return out
  }
  out.rodou = true

  // O mês que acabou de fechar.
  const ano = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear()
  const mes = agora.getMonth() === 0 ? 12 : agora.getMonth()
  const mesLabel = `${MESES[mes - 1]}`

  const admin = createAdminClient()
  const pendentes = await getFechamentosIncompletos(ano, mes)

  for (const f of pendentes) {
    // Trava própria: 20 dias. Se o cron rodar duas vezes no dia 3 (retry da
    // Vercel, clique manual), o cliente não leva dois e-mails iguais.
    const { data: ja } = await admin
      .from("email_enviados")
      .select("id")
      .eq("holding_id", f.holdingId)
      .eq("tipo", "fechamento-mes")
      .is("erro", null)
      .gte("enviado_em", new Date(Date.now() - 20 * 86_400_000).toISOString())
      .limit(1)
      .maybeSingle()
    if (ja) continue

    const contato = await contatoDaHolding(f.holdingId)
    if (!contato) {
      out.semContato.push(f.holdingNome)
      continue
    }

    const { assunto, html } = fechamentoIncompleto({
      nome: contato.nome,
      mesLabel,
      lojas: f.lojas,
      totalEstimado: f.totalEstimado,
    })
    const r = await enviarEmail({
      holdingId: f.holdingId,
      tipo: "fechamento-mes",
      para: contato.email,
      assunto,
      html,
      forcar: true,
    })
    if (r.ok && !r.jaEnviado) out.enviados.push(`${f.holdingNome} → ${contato.email}`)
  }

  return out
}
