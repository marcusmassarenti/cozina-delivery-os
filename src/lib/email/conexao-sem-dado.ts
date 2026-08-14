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
import { avisarRecusaPorEmail } from "@/lib/email/recusa"

/**
 * Dias de silêncio antes de cobrar a confirmação.
 *
 * Um dia. A conexão costuma fechar em 15 minutos depois da aprovação, então
 * passar um dia inteiro sem nada já é sinal de que travou — e quanto antes a
 * pergunta sai, menos tempo o cliente passa olhando uma tela vazia sem saber
 * de quem é a vez.
 */
const DIAS_DE_SILENCIO = 1

/**
 * Dias até a solicitação expirar sozinha.
 *
 * Passou disso sem dado, o pedido volta à estaca zero: o cliente pede de novo
 * quando estiver pronto. Uma fila que só cresce para de ser fila — solicitação
 * de três semanas atrás não diz nada sobre o que ainda vale.
 */
const DIAS_ATE_EXPIRAR = 3

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

/**
 * Marca da recusa automática. Fica na `nota`, que o cliente lê — e é também
 * como a rodada seguinte reconhece um pedido que JÁ expirou uma vez.
 */
const MARCA_EXPIRACAO = "Expirou sem trazer dado"

export type ResultadoExpiracao = {
  expiradas: { cliente: string; loja: string; cnpj: string | null }[]
  /** Segunda rodada do mesmo problema: não expira, chama gente. */
  reincidentes: { cliente: string; loja: string; cnpj: string | null }[]
}

/**
 * Solicitação parada há dias volta à estaca zero: recusada, cliente avisado,
 * fila limpa. Ele pede de novo quando estiver pronto.
 *
 * ⚠️ NÃO EXPIRA DUAS VEZES A MESMA LOJA. Se o pedido já expirou uma vez e o
 * cliente pediu de novo, expirar outra vez cria um moinho: pede → cobra em 1
 * dia → recusa em 3 → pede de novo → para sempre, com um e-mail por volta. E
 * o caso que mais provoca isso é justamente aquele em que o cliente não tem
 * culpa nenhuma — a loja da Tech Assessoria que o iFood mostra como "Ativo" e
 * não entrega. Na segunda vez o pedido FICA e entra em `reincidentes`, pra
 * uma pessoa olhar. Automação que insiste sozinha num problema que ela não
 * sabe resolver só produz barulho.
 */
export async function expirarSolicitacoesParadas(
  simular = false,
): Promise<ResultadoExpiracao> {
  const admin = createAdminClient()
  const corte = new Date(
    Date.now() - DIAS_ATE_EXPIRAR * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: reqs } = await admin
    .from("ifood_activation_requests")
    .select("id, holding_id, unit_id, cnpj, created_at, units!inner(id, name)")
    .in("status", ["pendente", "solicitada"])
    .lt("created_at", corte)

  const linhas = ((reqs ?? []) as unknown as {
    id: string
    holding_id: string
    unit_id: string
    cnpj: string | null
    units: { id: string; name: string }
  }[]).filter((r) => r.unit_id)

  const out: ResultadoExpiracao = { expiradas: [], reincidentes: [] }
  if (linhas.length === 0) return out

  // Loja que já vinculou não expira — a solicitação pode ter ficado aberta por
  // descuido, e recusar uma loja que está trazendo dado seria absurdo.
  const { data: vinculadas } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
    .in("unit_id", linhas.map((r) => r.unit_id))
  const jaVinculada = new Set(
    ((vinculadas ?? []) as { unit_id: string }[]).map((v) => v.unit_id),
  )

  // Quem já expirou antes: a segunda volta não é automática.
  const { data: antigas } = await admin
    .from("ifood_activation_requests")
    .select("unit_id")
    .eq("status", "recusada")
    .ilike("nota", `${MARCA_EXPIRACAO}%`)
    .in("unit_id", linhas.map((r) => r.unit_id))
  const jaExpirou = new Set(
    ((antigas ?? []) as { unit_id: string }[]).map((a) => a.unit_id),
  )

  const nomes = new Map<string, string>()
  const { data: hs } = await admin
    .from("holdings")
    .select("id, name")
    .in("id", [...new Set(linhas.map((r) => r.holding_id))])
  for (const h of (hs ?? []) as { id: string; name: string }[]) {
    nomes.set(h.id, h.name)
  }

  for (const r of linhas) {
    if (jaVinculada.has(r.unit_id)) continue
    const cliente = nomes.get(r.holding_id) ?? r.holding_id
    const item = { cliente, loja: r.units.name, cnpj: r.cnpj }

    if (jaExpirou.has(r.unit_id)) {
      out.reincidentes.push(item)
      continue
    }
    out.expiradas.push(item)
    if (simular) continue

    const nota = `${MARCA_EXPIRACAO} em ${DIAS_ATE_EXPIRAR} dias. Quando a loja estiver aprovada no Portal do Parceiro, é só pedir a conexão de novo pelo sistema.`
    const { error } = await admin
      .from("ifood_activation_requests")
      .update({ status: "recusada", nota, updated_at: new Date().toISOString() })
      .eq("id", r.id)
    if (error) continue

    // Avisa DEPOIS de gravar, pelo mesmo caminho do botão manual. Se o e-mail
    // falhar, a recusa continua de pé — e é assim que tem que ser: o estado é
    // o que manda, o aviso é o acessório.
    await avisarRecusaPorEmail({
      holdingId: r.holding_id,
      cnpj: r.cnpj ?? "",
      loja: r.units.name,
      motivo: nota,
    })
  }

  return out
}
