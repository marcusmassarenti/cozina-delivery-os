import "server-only"

/**
 * O RETRATO DA CONTA que a IA lê antes de responder um chamado.
 *
 * É isto que faz o chat de dentro do sistema valer mais que o WhatsApp. Lá o
 * cliente escreve "minha loja não conectou" e começa uma investigação: qual
 * loja, desde quando, o que já foi tentado. Aqui a resposta já existe no banco
 * no instante da pergunta — falta só entregá-la.
 *
 * REGRA DESTE ARQUIVO: só FATO com data. Nada de "provavelmente" ou "deve
 * estar". O que a IA não puder afirmar com o dado em mãos, ela não afirma — e
 * a conversa sobe pra um humano. Suporte que chuta é pior que suporte lento:
 * o cliente age em cima do palpite e perde a confiança quando não bate.
 *
 * O retrato é guardado junto da mensagem (`suporte_mensagens.raio_x`). Sem
 * isso, uma resposta errada vira discussão sem prova — ninguém consegue dizer
 * depois com base em quê a IA respondeu aquilo.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { computeBillingStatus, daysUntil, todayISO } from "@/lib/data/billing"

export type LojaNoRaioX = {
  code: string
  nome: string
  ativa: boolean
  plataformas: string[]
  /** Conectada por API em cada plataforma — o que dispensa planilha. */
  ifoodApi: boolean
  noveApi: boolean
  cwApi: boolean
  /** Último dia com lançamento do iFood. null = nunca entrou nada. */
  ifoodAte: string | null
  aguardandoIfood: boolean
}

export type RaioX = {
  empresa: string
  plano: string | null
  cobranca: { status: string; vencimento: string | null; emDias: number | null }
  lojas: { total: number; ativas: number; conectadasIfood: number }
  detalhe: LojaNoRaioX[]
  /** Conexões que o iFood parou de devolver = autorização revogada. */
  revogadas: { loja: string | null; desde: string }[]
  geradoEm: string
}

export async function montarRaioX(holdingId: string): Promise<RaioX | null> {
  const admin = createAdminClient()

  const { data: h } = await admin
    .from("holdings")
    .select("id, name, plan_tier, paid, due_date, suspend_on, trial_ends_at")
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null
  const holding = h as {
    name: string
    plan_tier: string | null
    paid: boolean | null
    due_date: string | null
    suspend_on: string | null
    trial_ends_at: string | null
  }

  const hoje = todayISO()
  const status = computeBillingStatus(
    {
      paymentMethod: null,
      monthlyFee: null,
      dueDate: holding.due_date,
      paid: !!holding.paid,
      suspendOn: holding.suspend_on,
      trialEndsAt: holding.trial_ends_at,
    },
    hoje,
  )

  const { data: us } = await admin
    .from("units")
    .select("id, code, name, active, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")
  const lojas = ((us ?? []) as unknown as {
    id: string
    code: string
    name: string
    active: boolean
  }[])
  const ids = lojas.map((u) => u.id)

  if (ids.length === 0) {
    return {
      empresa: holding.name,
      plano: holding.plan_tier,
      cobranca: {
        status,
        vencimento: holding.due_date,
        emDias: holding.due_date ? daysUntil(holding.due_date, hoje) : null,
      },
      lojas: { total: 0, ativas: 0, conectadasIfood: 0 },
      detalhe: [],
      revogadas: [],
      geradoEm: new Date().toISOString(),
    }
  }

  const [plats, comDado, solicitacoes, cwInstalls, links99] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("unit_id, platform, api_store_id")
      .in("unit_id", ids)
      .eq("active", true),
    // Quem já recebeu lançamento do iFood. RPC porque `distinct` não existe no
    // PostgREST e qualquer `limit` aqui mente numa rede grande (ver 0192).
    admin.rpc("unidades_com_dado_ifood", { p_unit_ids: ids }),
    admin
      .from("ifood_activation_requests")
      .select("unit_id, status")
      .in("unit_id", ids)
      .in("status", ["pendente", "solicitada"]),
    admin
      .from("cardapioweb_installs")
      .select("unit_id")
      .in("unit_id", ids)
      .eq("ambiente", "producao")
      .eq("active", true),
    admin.from("ninefood_store_links").select("unit_id").in("unit_id", ids).eq("active", true),
  ])

  const porUnit = new Map<string, { plats: string[]; ifoodApi: boolean }>()
  for (const p of (plats.data ?? []) as {
    unit_id: string
    platform: string
    api_store_id: string | null
  }[]) {
    const cur = porUnit.get(p.unit_id) ?? { plats: [], ifoodApi: false }
    cur.plats.push(p.platform)
    if (p.platform === "ifood" && p.api_store_id) cur.ifoodApi = true
    porUnit.set(p.unit_id, cur)
  }
  const temDado = new Set((comDado.data ?? []) as unknown as string[])
  const aguardando = new Set(
    ((solicitacoes.data ?? []) as { unit_id: string }[]).map((s) => s.unit_id),
  )
  const cw = new Set(((cwInstalls.data ?? []) as { unit_id: string }[]).map((r) => r.unit_id))
  const n99 = new Set(((links99.data ?? []) as { unit_id: string }[]).map((r) => r.unit_id))

  // Até que dia cada loja tem lançamento do iFood — é a pergunta "meu dado
  // está atrasado?", que é o segundo chamado mais comum depois de conexão.
  const ate = new Map<string, string>()
  for (const id of ids.filter((i) => temDado.has(i))) {
    const { data } = await admin
      .from("ifood_financeiro_lancamentos")
      .select("data_fato_gerador")
      .eq("unit_id", id)
      .not("data_fato_gerador", "is", null)
      .order("data_fato_gerador", { ascending: false })
      .limit(1)
    const d = (data ?? [])[0] as { data_fato_gerador: string } | undefined
    if (d?.data_fato_gerador) ate.set(id, String(d.data_fato_gerador).slice(0, 10))
  }

  const detalhe: LojaNoRaioX[] = lojas.map((u) => {
    const p = porUnit.get(u.id) ?? { plats: [], ifoodApi: false }
    return {
      code: u.code,
      nome: u.name,
      ativa: u.active,
      plataformas: p.plats,
      ifoodApi: p.ifoodApi,
      noveApi: n99.has(u.id),
      cwApi: cw.has(u.id),
      ifoodAte: ate.get(u.id) ?? null,
      aguardandoIfood: aguardando.has(u.id),
    }
  })

  // Revogadas: o iFood parou de devolver o merchant. Entra no raio-x porque é
  // a causa que o cliente NUNCA adivinha sozinho — do lado dele parece defeito
  // do nosso sistema.
  const { merchantsSumidos } = await import("@/lib/ifood/merchants-sumidos")
  const sumidos = await merchantsSumidos()
  const revogadas = sumidos
    .filter((m) => m.loja && lojas.some((u) => u.code === m.loja!.code))
    .map((m) => ({ loja: `${m.loja!.code} · ${m.loja!.name}`, desde: m.desde }))

  return {
    empresa: holding.name,
    plano: holding.plan_tier,
    cobranca: {
      status,
      vencimento: holding.due_date,
      emDias: holding.due_date ? daysUntil(holding.due_date, hoje) : null,
    },
    lojas: {
      total: lojas.length,
      ativas: lojas.filter((u) => u.active).length,
      conectadasIfood: detalhe.filter((d) => d.ifoodApi).length,
    },
    detalhe,
    revogadas,
    geradoEm: new Date().toISOString(),
  }
}
