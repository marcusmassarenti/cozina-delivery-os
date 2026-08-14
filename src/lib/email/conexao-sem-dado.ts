import "server-only"

/**
 * Cobra do cliente a confirmação quando a loja fica dias pedida e sem trazer
 * nada.
 *
 * POR QUE EXISTE: a Tech Assessoria passou dias com três lojas solicitadas,
 * zero dado no sistema e ninguém dizendo nada — a descoberta veio do Marcus ir
 * olhar por conta própria. Do lado do cliente, aquilo parecia simplesmente um
 * sistema que não funciona.
 *
 * O e-mail faz UMA pergunta fechada: você aprovou a conexão ou não? Não manda
 * "conferir configurações" nem afirma que ele deixou de aprovar. Quem já
 * aprovou responde e a bola passa pra nós (é caso de chamado com o iFood);
 * quem não aprovou descobre o que falta. Sem essa resposta, os dois lados
 * ficam esperando o outro se mexer — que é exatamente o que aconteceu.
 *
 * ⚠️ NÃO acusa o cliente. Foi esse palpite que a gente teve que remover das
 * telas em ago/26: "não chegou dado" e "você não autorizou" são coisas
 * diferentes, e tratá-las como a mesma faz cobrar de quem já fez a parte dele.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { contatosPorHolding } from "@/lib/data/contato-cliente"
import { enviarEmail } from "@/lib/email/enviar"
import { conexaoSemDado } from "@/lib/email/templates"

/**
 * Dias de silêncio antes de cobrar.
 *
 * Três, não um: a aprovação no Portal do Parceiro depende de a pessoa certa
 * (o Proprietário) sentar e fazer, e cobrar no dia seguinte trata atraso
 * normal como problema. Três dias já é tempo de sobra pra uma conexão que
 * costuma fechar em 15 minutos — passou disso, alguma coisa travou.
 */
const DIAS_DE_SILENCIO = 3

export type ResultadoCobranca = {
  clientes: number
  lojas: number
  enviados: { cliente: string; para: string; lojas: string[]; erro?: string }[]
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

/**
 * @param simular quando true, monta tudo e NÃO envia — pra conferir quem
 * receberia antes de disparar de verdade.
 * @param opts.diasMinimos sobrescreve a espera. O cron NUNCA passa isto: é pra
 * disparo à mão, quando já se sabe que a loja travou e não faz sentido esperar
 * o prazo (foi o caso da Tech Assessoria, pedida na véspera e já com chamado
 * aberto no iFood).
 * @param opts.holdingIds restringe a clientes específicos, pelo mesmo motivo.
 */
export async function cobrarConfirmacaoDeConexao(
  simular = false,
  opts: { diasMinimos?: number; holdingIds?: string[] } = {},
): Promise<ResultadoCobranca> {
  const admin = createAdminClient()
  const dias = opts.diasMinimos ?? DIAS_DE_SILENCIO
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  // Solicitações abertas, antigas e ainda não cobradas.
  let q = admin
    .from("ifood_activation_requests")
    .select("id, holding_id, unit_id, cnpj, created_at, units!inner(id, name)")
    .in("status", ["pendente", "solicitada"])
    .is("cobranca_enviada_em", null)
    .lt("created_at", corte)
  if (opts.holdingIds?.length) q = q.in("holding_id", opts.holdingIds)
  const { data: reqs } = await q

  const linhas = ((reqs ?? []) as unknown as {
    id: string
    holding_id: string
    unit_id: string
    cnpj: string | null
    created_at: string
    units: { id: string; name: string }
  }[]).filter((r) => r.unit_id)

  if (linhas.length === 0) return { clientes: 0, lojas: 0, enviados: [] }

  // Loja que JÁ vinculou não entra: a solicitação pode ter ficado aberta por
  // descuido, e cobrar confirmação de uma loja que já está trazendo dado é o
  // tipo de e-mail que faz o cliente parar de ler os nossos.
  const { data: vinculadas } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
    .in("unit_id", linhas.map((r) => r.unit_id))
  const jaVinculada = new Set(
    ((vinculadas ?? []) as { unit_id: string }[]).map((v) => v.unit_id),
  )

  const pendentes = linhas.filter((r) => !jaVinculada.has(r.unit_id))
  if (pendentes.length === 0) return { clientes: 0, lojas: 0, enviados: [] }

  const porHolding = new Map<string, typeof pendentes>()
  for (const r of pendentes) {
    porHolding.set(r.holding_id, [...(porHolding.get(r.holding_id) ?? []), r])
  }

  const contatos = await contatosPorHolding()
  const enviados: ResultadoCobranca["enviados"] = []
  let lojas = 0

  for (const [holdingId, doCliente] of porHolding) {
    const contato = contatos.get(holdingId)
    const nomeCliente = contato?.nomeCliente ?? holdingId
    if (!contato?.email) {
      enviados.push({
        cliente: nomeCliente,
        para: "—",
        lojas: doCliente.map((r) => r.units.name),
        erro: "cliente sem e-mail de contato",
      })
      continue
    }

    const email = conexaoSemDado({
      nome: contato.nome,
      lojas: doCliente.map((r) => ({
        nome: r.units.name,
        cnpj: r.cnpj,
        desde: dataBr(r.created_at),
      })),
    })

    if (simular) {
      enviados.push({
        cliente: nomeCliente,
        para: contato.email,
        lojas: doCliente.map((r) => r.units.name),
      })
      lojas += doCliente.length
      continue
    }

    const r = await enviarEmail({
      holdingId,
      tipo: `conexao-sem-dado-${holdingId}`,
      para: contato.email,
      assunto: email.assunto,
      html: email.html,
      // A trava de verdade é o carimbo por loja, logo abaixo. Ver a nota no
      // tipo em enviar.ts.
      forcar: true,
    })

    // Carimba só o que FOI enviado. Marcar antes transformaria uma falha de
    // envio em "já cobrado" — e essas lojas nunca mais seriam cobradas.
    if (r.ok) {
      await admin
        .from("ifood_activation_requests")
        .update({ cobranca_enviada_em: new Date().toISOString() })
        .in("id", doCliente.map((x) => x.id))
      lojas += doCliente.length
    }

    enviados.push({
      cliente: nomeCliente,
      para: contato.email,
      lojas: doCliente.map((x) => x.units.name),
      erro: r.ok ? undefined : (r.erro ?? "falha no envio"),
    })
  }

  return { clientes: enviados.length, lojas, enviados }
}
