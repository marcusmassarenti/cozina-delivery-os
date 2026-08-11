/**
 * Disparo da campanha de novidades — avulso, não faz parte da régua.
 *
 * Um por CLIENTE (holding), no administrador que abriu a conta. Não manda pra
 * cada usuário: numa conta com cinco pessoas, cinco e-mails iguais no mesmo
 * minuto parecem falha do sistema.
 *
 * Sem `forcar`: a trava de duplicidade do `enviarEmail` é o que garante que
 * rodar duas vezes não vira dois e-mails pro mesmo cliente.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { contatoDaHolding } from "@/lib/email/contato-holding"
import { enviarEmail } from "@/lib/email/enviar"
import { novidadesAgosto26 } from "@/lib/email/templates"

export type ResultadoNovidades = {
  enviados: { cliente: string; para: string }[]
  jaEnviados: string[]
  semContato: string[]
  erros: { cliente: string; erro: string }[]
}

export async function enviarNovidades(opts: {
  /** Sem isso a função não manda nada — evita disparo por engano. */
  confirmar: boolean
  /** Restringe a um e-mail só (teste). */
  somentePara?: string
}): Promise<ResultadoNovidades> {
  const out: ResultadoNovidades = {
    enviados: [],
    jaEnviados: [],
    semContato: [],
    erros: [],
  }
  if (!opts.confirmar) return out

  const admin = createAdminClient()
  const { data: holdings } = await admin
    .from("holdings")
    .select("id, name")
    // A conta interna (a nossa) fica de fora: novidade que eu mesmo escrevi
    // não precisa voltar por e-mail.
    .eq("conta_interna", false)
    .order("name")

  for (const h of (holdings ?? []) as { id: string; name: string }[]) {
    const contato = await contatoDaHolding(h.id)
    if (!contato?.email) {
      out.semContato.push(h.name)
      continue
    }
    if (opts.somentePara && contato.email !== opts.somentePara) continue

    const m = novidadesAgosto26({ nome: contato.nome })
    const r = await enviarEmail({
      holdingId: h.id,
      tipo: "novidades-ago26",
      para: contato.email,
      assunto: m.assunto,
      html: m.html,
    })
    if (r.jaEnviado) out.jaEnviados.push(h.name)
    else if (r.ok) out.enviados.push({ cliente: h.name, para: contato.email })
    else out.erros.push({ cliente: h.name, erro: r.erro ?? "?" })
  }

  return out
}
