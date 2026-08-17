import "server-only"

/**
 * Os dois e-mails do aceite: o comprovante pra quem aceitou e o aviso pra cá.
 *
 * ── POR QUE O COMPROVANTE IMPORTA ────────────────────────────────────────
 * Quem clicou em "aceito" precisa sair com alguma coisa na mão. Numa
 * plataforma de assinatura, esse e-mail é metade do produto — é ele que fica
 * na caixa de entrada do cliente com data, hora e hash, fora do nosso banco.
 * Um registro que só existe do lado de quem cobra vale menos como prova.
 *
 * `forcar: true` nos dois: a trava de duplicidade do `enviarEmail` é por
 * cliente × tipo, e um cliente pode aceitar mais de uma proposta ao longo do
 * tempo (renovação, mudança de plano). Sem forçar, o segundo aceite não
 * geraria comprovante nenhum.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEmail } from "@/lib/email/enviar"
import { propostaAceita } from "@/lib/email/templates"
import { fmtDoc } from "@/lib/data/proposta-aceite"

const INTERNO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"

export async function avisarPropostaAceita(token: string): Promise<void> {
  const { data } = await createAdminClient()
    .from("propostas")
    .select(
      "id, numero, holding_id, dados, signatario_nome, signatario_cpf, signatario_cargo, signatario_email, aceite_ip, aceite_hash, assinada_em, holdings(name)",
    )
    .eq("token_publico", token)
    .maybeSingle()
  if (!data) return

  const p = data as unknown as Record<string, unknown>
  const dados = (p.dados ?? {}) as { razaoSocial?: string; totalMensal?: number }
  const cliente =
    (p.holdings as { name?: string } | null)?.name ??
    dados.razaoSocial ??
    "Cliente"
  const quando = new Date(p.assinada_em as string).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  })

  const comum = {
    numero: p.numero as string,
    cliente,
    nome: (p.signatario_nome as string) ?? "",
    cargo: (p.signatario_cargo as string) ?? "",
    doc: fmtDoc((p.signatario_cpf as string) ?? ""),
    email: (p.signatario_email as string) ?? "",
    ip: (p.aceite_ip as string) ?? "",
    hash: (p.aceite_hash as string) ?? "",
    quando,
  }

  const paraCliente = propostaAceita({ ...comum, interno: false })
  await enviarEmail({
    holdingId: p.holding_id as string,
    tipo: "proposta-aceita",
    para: comum.email,
    assunto: paraCliente.assunto,
    html: paraCliente.html,
    forcar: true,
  })

  const paraNos = propostaAceita({ ...comum, interno: true })
  await enviarEmail({
    // Sem holdingId: é aviso interno, não parte da régua do cliente.
    holdingId: null,
    tipo: "proposta-aceita",
    para: INTERNO,
    assunto: paraNos.assunto,
    html: paraNos.html,
    forcar: true,
  })
}
