/**
 * Preview de e-mail RENDERIZADO PELO SERVIDOR, sem enviar.
 *
 * Existe porque `getRealMonthlyForUnits` usa `unstable_cache`, que só funciona
 * dentro do runtime do Next: script solto quebra com "incrementalCache
 * missing". Sem isto, o único jeito de conferir o número de um e-mail é
 * ENVIÁ-LO — e foi assim que um e-mail com 29% do faturamento real chegou a
 * ficar pronto pra sair.
 *
 *   /api/dev/preview-email                → loja compartilhada
 *   /api/dev/preview-email?tipo=conexao   → "sua loja está conectada" (iFood)
 *   /api/dev/preview-email?tipo=saude     → relatório de saúde, com o dado de AGORA
 *
 * Superadmin apenas. Não envia nada: renderiza e devolve o HTML.
 */
import { requireSuperadmin } from "@/lib/auth/guards"
import { getLojasCompartilhadasPorHolding } from "@/lib/data/lojas-compartilhadas"
import { contatoDaHolding } from "@/lib/email/contato-holding"
import { resumoDoAno } from "@/lib/email/resumo-da-loja"
import { lojaCompartilhada } from "@/lib/email/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  await requireSuperadmin()

  const tipo = new URL(req.url).searchParams.get("tipo")

  // Aviso de manutenção não depende de loja nenhuma — sai antes de procurar
  // loja compartilhada, senão a rota morre no "sem loja compartilhada".
  /**
   * Relatório de saúde com o dado deste instante — o mesmo que o cron
   * mandaria, sem mandar. Existe pelo mesmo motivo da rota inteira: até aqui,
   * conferir o conteúdo do relatório exigia esperar as 11h ou disparar o cron
   * e receber o e-mail de verdade.
   */
  if (tipo === "saude") {
    const [
      { diagnosticarIntegracoes },
      { conferirFontes },
      { resumoDaRodada },
      { agruparSaude },
      { medirInfra },
      { emailSaude },
      { estadoDoPipeline },
    ] = await Promise.all([
      import("@/lib/data/saude-integracoes"),
      import("@/lib/data/conferencia-fontes"),
      import("@/lib/data/rodada-diaria"),
      import("@/lib/data/saude-agrupada"),
      import("@/lib/data/infra-metricas"),
      import("@/lib/email/saude"),
      import("@/lib/data/pipeline-do-dia"),
    ])

    const agora = new Date()
    const s2 = await diagnosticarIntegracoes()
    const linhas = await conferirFontes(agora.getFullYear(), agora.getMonth() + 1)
    const conferencia = linhas
      .filter((l) => l.soApiMiolo > 0 || l.soPlanilhaMiolo > 0)
      .slice(0, 25)
      .map((l) => ({
        clienteNome: l.clienteNome,
        unitCode: l.unitCode,
        unitName: l.unitName,
        plataforma: "iFood",
        pedidosApi: l.pedidosApi,
        pedidosPlanilha: l.pedidosPlanilha,
        provavelMotivo: l.provavelMotivo,
      }))
    const [rodada, g, infra, estado] = await Promise.all([
      resumoDaRodada().catch(() => undefined),
      Promise.resolve(agruparSaude(s2.lojas)),
      medirInfra().catch(() => null),
      estadoDoPipeline(),
    ])
    // A prévia mostra o e-mail INTEIRO — inclusive os blocos novos, senão ela
    // deixa de servir pra revisar o que sai.
    const { merchantsIrmaos } = await import("@/lib/data/merchants-irmaos")
    const irmaos = await merchantsIrmaos().catch(() => [])
    const m = emailSaude(s2, conferencia, rodada, g, infra, [], irmaos)
    const aviso = estado.concluido
      ? ""
      : `<div style="padding:10px 14px;background:#fff7ed;border-left:3px solid #ff4d1c;font:600 13px system-ui;color:#7c2d12;">
           PREVIEW · a rotina do dia ainda não fechou — ${estado.faltamExtrato} loja(s) sem extrato,
           ${estado.faltamBackfill} no backfill. O cron só enviaria agora se fosse a última janela.
         </div>`
    return new Response(aviso + m.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  if (tipo === "manutencao") {
    const { manutencaoIfood } = await import("@/lib/email/templates")
    const m = manutencaoIfood({ nome: "Marcus" })
    return new Response(m.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const mapa = await getLojasCompartilhadasPorHolding()
  const [holdingId, lojas] = [...mapa.entries()][0] ?? []
  if (!holdingId || !lojas?.[0]) return new Response("sem loja compartilhada")
  const loja = lojas[0]
  const contato = await contatoDaHolding(holdingId)

  if (tipo === "conexao") {
    const { conexaoAtivada } = await import("@/lib/email/templates")
    const { resumoDaLoja } = await import("@/lib/email/conexao-ativada")
    const r = await resumoDaLoja(loja.unitId, "ifood")
    const m = conexaoAtivada({
      nome: contato?.nome ?? null,
      loja: `#${loja.code} ${loja.name}`,
      plataforma: "iFood",
      linhas: r.linhas,
      pendencias: r.pendencias,
    })
    return new Response(m.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const resumo = await resumoDoAno(loja.unitId)
  const m = lojaCompartilhada({
    nome: contato?.nome ?? null,
    loja: `#${loja.code} ${loja.name}`,
    dona: loja.donaNome,
    linhas: resumo.linhas,
    plataformas: resumo.plataformas,
  })
  return new Response(m.html, { headers: { "content-type": "text/html; charset=utf-8" } })
}

/**
 * Envia de verdade. POST e não GET de propósito: rota que manda e-mail não
 * pode disparar por alguém colar a URL no navegador.
 *
 *   { "para": "email@teste" }  → manda SÓ pra esse endereço, com [TESTE] no
 *                                assunto e `forcar` (não gasta a trava)
 *   { "cliente": true }        → manda pro cliente de verdade, com a trava de
 *                                duplicidade valendo
 */
export async function POST(req: Request) {
  await requireSuperadmin()
  const body = (await req.json().catch(() => ({}))) as {
    para?: string
    cliente?: boolean
    tipo?: string
    excluir?: string[]
    holdingId?: string
  }

  // Cobrança de UM cliente, na hora. Existe porque a régua roda 10h da manhã:
  // cliente cujo vencimento é hoje só receberia o toque amanhã, já suspenso.
  // Manda só pra holding pedida — rodar a régua inteira dispararia também as
  // outras regras (boas-vindas, fim de teste) pra quem casasse hoje.
  if (body.tipo === "fatura" && body.holdingId) {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { contatoDaHolding } = await import("@/lib/email/contato-holding")
    const { faturaVencendo } = await import("@/lib/email/templates")
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { todayISO, daysUntil } = await import("@/lib/data/billing")

    const admin = createAdminClient()
    const { data: h } = await admin
      .from("holdings")
      .select("name, due_date, suspend_on, monthly_fee")
      .eq("id", body.holdingId)
      .maybeSingle()
    if (!h?.due_date) return Response.json({ erro: "holding sem vencimento" })

    const contato = await contatoDaHolding(body.holdingId)
    if (!contato?.email) return Response.json({ erro: "holding sem contato" })

    const venc = String(h.due_date)
    const dias = daysUntil(venc, todayISO())
    const fmt = (iso: string) => iso.split("-").reverse().join("/")
    const m = faturaVencendo({
      nome: contato.nome,
      empresa: String(h.name),
      temLoja: true,
      valorMensal: h.monthly_fee ? Number(h.monthly_fee) : undefined,
      vencimento: fmt(venc),
      diasRestantes: dias,
      suspendeEm: h.suspend_on ? fmt(String(h.suspend_on)) : undefined,
    })
    const tipo =
      dias <= 0 ? "fatura-vence-hoje" : dias <= 2 ? "fatura-2-dias" : "fatura-5-dias"
    const r = await enviarEmail({
      holdingId: body.holdingId,
      tipo: `${tipo}-${venc}`,
      para: contato.email,
      assunto: m.assunto,
      html: m.html,
    })
    return Response.json({ para: contato.email, dias, tipo, ...r })
  }

  // Aviso de manutenção do iFood — disparo pontual, para quem tem iFood ativo.
  if (body.tipo === "manutencao") {
    const { avisarManutencaoIfood } = await import(
      "@/lib/email/manutencao-ifood"
    )
    return Response.json(await avisarManutencaoIfood({ excluir: body.excluir }))
  }

  if (body.cliente) {
    const { avisarLojasCompartilhadas } = await import(
      "@/lib/email/loja-compartilhada"
    )
    return Response.json(await avisarLojasCompartilhadas())
  }

  if (!body.para) return Response.json({ erro: "informe `para` ou `cliente`" })

  const mapa = await getLojasCompartilhadasPorHolding()
  const [holdingId, lojas] = [...mapa.entries()][0] ?? []
  if (!holdingId || !lojas?.[0])
    return Response.json({ erro: "nenhuma loja compartilhada" })
  const loja = lojas[0]
  const contato = await contatoDaHolding(holdingId)
  const resumo = await resumoDoAno(loja.unitId)
  const m = lojaCompartilhada({
    nome: contato?.nome ?? null,
    loja: `#${loja.code} ${loja.name}`,
    dona: loja.donaNome,
    linhas: resumo.linhas,
    plataformas: resumo.plataformas,
  })
  const { enviarEmail } = await import("@/lib/email/enviar")
  const r = await enviarEmail({
    holdingId: null,
    tipo: "loja-compartilhada",
    para: body.para,
    assunto: `[TESTE] ${m.assunto}`,
    html: m.html,
    forcar: true,
  })
  return Response.json({ destinatarioReal: contato?.email, teste: r })
}
