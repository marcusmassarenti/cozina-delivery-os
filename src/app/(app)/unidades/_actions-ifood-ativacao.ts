"use server"

/**
 * Solicitação de ativação do iFood via API — lado do CLIENTE.
 *
 * O app do iFood é centralizado: não existe código self-service. O que o
 * cliente pode fazer é PEDIR a conexão informando o CNPJ da loja; a
 * solicitação real acontece no Portal do Desenvolvedor (feita pelo admin
 * da plataforma) e a aprovação final é do Proprietário, no Portal do
 * Parceiro dele. Esta action só registra o pedido na fila.
 */
import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/guards"
import { normalizarCnpj } from "@/lib/cnpj"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
} from "@/lib/auth/permissions"
import { avisarSolicitacaoIfood } from "@/lib/ifood/avisar-solicitacao"

export type SolicitacaoIfoodState = {
  ok: boolean
  message?: string
}

/**
 * Lojas da holding que compartilham o CNPJ (dark kitchens: várias marcas na
 * mesma cozinha). A aprovação do iFood é POR CNPJ — quem aprova uma, conecta
 * todas — mas o cliente pensa por loja e clicava loja a loja, levando "já
 * existe solicitação" como se fosse erro (Marcus, 01/09/26, caso Le Brunch:
 * 3 marcas no CNPJ da Lorena). Quem traduz a característica é o sistema.
 */
async function lojasDoMesmoCnpj(
  admin: Awaited<ReturnType<typeof requireAdmin>>["admin"],
  holdingId: string,
  cnpj: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await admin
    .from("units")
    .select("id, name, cnpj, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
  return ((data ?? []) as { id: string; name: string; cnpj: string | null }[])
    .filter((u) => (u.cnpj ?? "").replace(/\D/g, "") === cnpj)
    .map((u) => ({ id: u.id, name: u.name }))
}

export async function solicitarAtivacaoIfood(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let userId: string
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    const auth = await requireAdmin()
    userId = auth.userId
    admin = auth.admin
  } catch {
    return {
      ok: false,
      message: "Só administradores podem solicitar a conexão.",
    }
  }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) {
    return { ok: false, message: "Não consegui identificar a sua empresa." }
  }

  // "cnpj_api" vem do bloco dentro do cadastro (Editar unidade), que já tem
  // um campo "cnpj" próprio (o do cadastro) — nome distinto evita colisão.
  const cnpj = normalizarCnpj(
    String(formData.get("cnpj_api") ?? formData.get("cnpj") ?? ""),
  )
  if (!cnpj) {
    return {
      ok: false,
      message:
        "Esse CNPJ não é válido — algum número está trocado. Confira no cartão CNPJ e digite de novo.",
    }
  }

  // O pedido nasce DA página da unidade, então ela é obrigatória — e
  // precisa ser uma unidade que o usuário realmente enxerga.
  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  // Evita pedido duplicado do mesmo CNPJ ainda em andamento.
  const { data: aberta } = await admin
    .from("ifood_activation_requests")
    .select("id, status")
    .eq("holding_id", holdingId)
    .eq("cnpj", cnpj)
    .in("status", ["pendente", "solicitada"])
    .maybeSingle()
  if (aberta) {
    // NÃO é erro: a aprovação do iFood é por CNPJ, então a loja clicada entra
    // na MESMA aprovação que já está andando. Recusar aqui fazia o cliente de
    // dark kitchen achar que as outras marcas ficaram de fora.
    const irmas = await lojasDoMesmoCnpj(admin, holdingId, cnpj)
    const outras = irmas.filter((u) => u.id !== unitId).map((u) => u.name)
    const cobre =
      outras.length > 0
        ? ` A aprovação é por CNPJ e cobre também: ${outras.join(", ")}.`
        : ""
    return {
      ok: true,
      message:
        aberta.status === "pendente"
          ? `Esta loja já está na solicitação em análise deste CNPJ.${cobre}`
          : `Esta loja entra na aprovação que já está com o proprietário — uma única aprovação no Portal do Parceiro conecta todas as lojas do CNPJ.${cobre}`,
    }
  }

  const { error } = await admin.from("ifood_activation_requests").insert({
    holding_id: holdingId,
    unit_id: unitId,
    cnpj,
    requested_by: userId,
  })
  if (error) {
    return { ok: false, message: `Falha ao registrar: ${error.message}` }
  }

  // Sem await: o cliente não espera o Resend pra ver que o pedido entrou.
  void avisarSolicitacaoIfood(holdingId, { tipo: "pedido", cnpj, unitId })

  revalidatePath("/unidades")
  const irmas = await lojasDoMesmoCnpj(admin, holdingId, cnpj)
  const outras = irmas.filter((u) => u.id !== unitId).map((u) => u.name)
  return {
    ok: true,
    message:
      outras.length > 0
        ? `Solicitação registrada! Este CNPJ cobre também ${outras.join(", ")} — uma única aprovação do proprietário conecta ${irmas.length} lojas de uma vez.`
        : "Solicitação registrada! Vamos conectar sua loja e você acompanha o status aqui.",
  }
}

/**
 * O CLIENTE avisa que já aprovou a conexão no Portal do Parceiro dele —
 * carimba `cliente_confirmou_at` na solicitação `solicitada` da unidade.
 * Isso acende um sinal no painel do admin (hora de vincular). Só o dono da
 * conta (admin da holding) confirma, e só numa unidade que ele enxerga.
 */
export async function confirmarAprovacaoIfood(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem confirmar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  const unitId = String(formData.get("unit_id") ?? "").trim()
  if (!unitId) return { ok: false, message: "Unidade não informada." }
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(unitId)) {
    return { ok: false, message: "Unidade inválida." }
  }

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({ cliente_confirmou_at: new Date().toISOString() })
    .eq("holding_id", holdingId)
    .eq("unit_id", unitId)
    .eq("status", "solicitada")
    .is("cliente_confirmou_at", null)
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  void avisarSolicitacaoIfood(holdingId, { tipo: "aprovacao", lojas: 1, unitId })

  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return { ok: true, message: "Avisamos a equipe — falta pouco!" }
}

/**
 * Mesma confirmação, mas para TODAS as lojas pendentes de uma vez.
 *
 * O Proprietário aprova as lojas em sequência no Portal do Parceiro, então
 * confirmar uma a uma virava 7 cliques repetindo a mesma informação.
 */
export async function confirmarTodasAprovacoesIfood(
  _prev: SolicitacaoIfoodState,
  _formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem confirmar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  // Escopado à holding E às unidades que a pessoa enxerga — confirmar em lote
  // não pode virar atalho pra tocar em loja fora do alcance dela.
  const acessiveis = await getAccessibleUnitIds()

  let q = admin
    .from("ifood_activation_requests")
    .update({ cliente_confirmou_at: new Date().toISOString() })
    .eq("holding_id", holdingId)
    .eq("status", "solicitada")
    .is("cliente_confirmou_at", null)
  if (acessiveis !== null) q = q.in("unit_id", acessiveis)

  const { data, error } = await q.select("id")
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  const n = (data ?? []).length
  // Só avisa se alguma coisa mudou de fato — confirmar em lote sem nada
  // pendente é clique inofensivo, e e-mail de "0 lojas" é ruído.
  if (n > 0)
    void avisarSolicitacaoIfood(holdingId, {
      tipo: "aprovacao",
      lojas: n,
      unitId: null,
    })
  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return {
    ok: true,
    message:
      n > 0
        ? `Avisamos a equipe sobre ${n} loja${n > 1 ? "s" : ""} — falta pouco!`
        : "Nada pendente de confirmação.",
  }
}

/** Situação da conexão iFood de UMA loja do cliente, pro aviso na home. */
export type MinhaSolicitacao = {
  id: string
  unitId: string
  unitCode: string | null
  unitName: string
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  clienteConfirmou: boolean
  atualizadaEm: string
  /** O motivo escrito na recusa — é o que a pessoa precisa ler pra agir. */
  nota: string | null
  /**
   * Já chegou algum lançamento do iFood pra esta loja.
   *
   * Conectar e receber o dado são momentos DIFERENTES, e a distância entre os
   * dois é de horas: o vínculo é imediato, mas quem baixa o extrato e o
   * histórico é o cron da manhã seguinte. Sem separar os dois estados, o
   * cliente recebia "conectada! 🎉" e abria um dashboard vazio — a leitura
   * óbvia é que quebrou, não que está a caminho.
   */
  temDado: boolean
  /**
   * O histórico já terminou de ser buscado?
   *
   * Sem isso, loja conectada e sem venda ficava com "estamos baixando o
   * histórico…" PARA SEMPRE — o aviso mede a chegada do dado, e dado que não
   * existe nunca chega. Foi o caso da Araraquara em 22/08/26: autorizada,
   * vinculada, e desabilitada no iFood, então não há venda nenhuma pra trazer.
   *
   * Com o carimbo dá pra dizer a verdade: "perguntamos e não havia venda"
   * é uma resposta, e é bem diferente de "ainda estamos procurando".
   */
  historicoFechado: boolean
}

/**
 * Solicitações de conexão iFood do PRÓPRIO cliente (escopo dele), pro aviso
 * na tela inicial: "falta você aprovar" / "sua loja foi conectada" / "não deu
 * certo, e por quê". Superadmin não usa (tem o painel).
 *
 * ⚠️ 'recusada' entra AQUI. Ela ficava de fora e o resultado era o pior
 * possível: o pedido simplesmente sumia da home e o cliente continuava
 * esperando por uma conexão que não vinha, sem nunca saber que foi recusada —
 * a explicação existia, mas só aparecia se ele entrasse na página daquela loja.
 */
export async function getMinhasSolicitacoesIfood(): Promise<MinhaSolicitacao[]> {
  const { isSuperadmin, getVerComoHoldingId } = await import(
    "@/lib/auth/permissions"
  )
  // Superadmin não vê o aviso do cliente -- ele tem o painel. MAS o "ver como
  // o cliente" precisa mostrar: era exatamente por aqui que a faixa sumia.
  // Quem é dono da plataforma continua sendo superadmin dentro do modo, então
  // `isSuperadmin()` sozinho escondia o aviso justamente no único caminho que
  // existe pra conferir a conta de um cliente. A pergunta certa não é "sou
  // superadmin?", é "estou agindo como a plataforma agora?".
  const verComo = await getVerComoHoldingId()
  if (!verComo && (await isSuperadmin())) return []
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && acessiveis.length === 0) return []

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const db = createAdminClient()
  const q = db
    .from("ifood_activation_requests")
    .select(
      "id, unit_id, cnpj, status, nota, cliente_confirmou_at, updated_at, units(code, name)",
    )
    .eq("holding_id", holdingId)
    .in("status", ["solicitada", "ativa", "recusada"])
    .order("updated_at", { ascending: false })
  const { data } = await q
  const cruas = ((data ?? []) as unknown as {
    id: string
    unit_id: string
    cnpj: string
    status: MinhaSolicitacao["status"]
    nota: string | null
    cliente_confirmou_at: string | null
    updated_at: string
    units: { code: string; name: string } | null
  }[])

  /* ── ESPELHO POR CNPJ ─────────────────────────────────────────────────
   *
   * A aprovação do iFood é por CNPJ, mas o pedido carrega UMA unidade — e as
   * irmãs de dark kitchen (várias marcas na mesma cozinha, caso Le Brunch)
   * ficavam SEM status nenhum na faixa, como se ninguém tivesse pedido nada
   * por elas. Aqui cada pedido vira uma linha POR LOJA do mesmo CNPJ: o
   * cliente vê o estado onde ele procura, na loja dele.
   *
   * O filtro de acesso muda de lugar junto: antes cortava pelo unit_id do
   * PEDIDO, agora corta pelas lojas espelhadas — um franqueado com acesso só
   * à irmã continua vendo o status dela. */
  const { data: unitsHolding } = await db
    .from("units")
    .select("id, code, name, cnpj, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
  const porCnpj = new Map<string, { id: string; code: string; name: string }[]>()
  for (const u of (unitsHolding ?? []) as {
    id: string
    code: string
    name: string
    cnpj: string | null
  }[]) {
    const dig = (u.cnpj ?? "").replace(/\D/g, "")
    if (!dig) continue
    const arr = porCnpj.get(dig) ?? []
    arr.push({ id: u.id, code: u.code, name: u.name })
    porCnpj.set(dig, arr)
  }

  const linhas: (typeof cruas[number] & { espelhoDe?: string })[] = []
  const vistos = new Set<string>()
  for (const s0 of cruas) {
    const lojas = porCnpj.get((s0.cnpj ?? "").replace(/\D/g, "")) ?? []
    const alvos = lojas.length > 0
      ? lojas
      : [{ id: s0.unit_id, code: s0.units?.code ?? "", name: s0.units?.name ?? "sua loja" }]
    for (const l of alvos) {
      if (acessiveis !== null && !acessiveis.includes(l.id)) continue
      // Uma loja aparece UMA vez (o pedido mais recente do CNPJ dela ganha).
      if (vistos.has(l.id)) continue
      vistos.add(l.id)
      linhas.push({
        ...s0,
        unit_id: l.id,
        units: { code: l.code, name: l.name },
        espelhoDe: l.id === s0.unit_id ? undefined : s0.unit_id,
      })
    }
  }

  // Quais dessas lojas JÁ têm lançamento do iFood.
  //
  // ⚠️ NÃO DÁ PRA FAZER ISSO LENDO AS LINHAS. A primeira versão era
  // `select unit_id ... in(lista) limit 2000` montando um Set: as 2.000
  // primeiras linhas da DG FOODS (651.809 no total) cobriam DUAS lojas, e as
  // outras 45 — sincronizando há meses — apareciam no dashboard dela como
  // "Buscando os dados de 45 lojas no iFood…". Sem `distinct` no PostgREST,
  // qualquer limite escolhido aqui é um número que mente numa rede grande.
  //
  // O `distinct` mora no banco (migration 0192): uma ida, resposta exata, e o
  // tamanho da resposta é o número de LOJAS, não o de lançamentos.
  const comDado = new Set<string>()
  const ativas = linhas.filter((s) => s.status === "ativa").map((s) => s.unit_id)
  if (ativas.length > 0) {
    const { data: cds, error } = await db.rpc("unidades_com_dado_ifood", {
      p_unit_ids: ativas,
    })
    // Falhar aqui NÃO pode inventar "sem dado": isso acenderia o aviso de
    // sincronização em loja que já recebe. Na dúvida, trata como recebendo —
    // o pior caso vira uma comemoração a mais, não um alarme falso.
    if (error) {
      console.error("unidades_com_dado_ifood:", error.message)
      for (const id of ativas) comDado.add(id)
    } else {
      for (const r of (cds ?? []) as unknown as string[]) comDado.add(r)
    }
  }

  /* Quem já teve o histórico buscado — ver `historicoFechado` no tipo. */
  const backfillFeito = new Set<string>()
  if (ativas.length > 0) {
    const { data: bf } = await db
      .from("unit_platforms")
      .select("unit_id, historico_backfill_at")
      .eq("platform", "ifood")
      .in("unit_id", ativas)
      .not("historico_backfill_at", "is", null)
    for (const r of (bf ?? []) as { unit_id: string }[])
      backfillFeito.add(r.unit_id)
  }

  return linhas.map((s) => ({
    // O espelho gera N linhas do mesmo pedido — o id composto mantém a chave
    // única sem inventar pedido novo.
    id: s.espelhoDe ? `${s.id}:${s.unit_id}` : s.id,
    unitId: s.unit_id,
    unitCode: s.units?.code ?? null,
    unitName: s.units?.name ?? "sua loja",
    status: s.status,
    clienteConfirmou: !!s.cliente_confirmou_at,
    atualizadaEm: s.updated_at,
    nota: s.nota ?? null,
    temDado: comDado.has(s.unit_id),
    historicoFechado: backfillFeito.has(s.unit_id),
  }))
}

/**
 * "Essa loja não apareceu" — o cliente devolve a solicitação pra fila.
 *
 * Existe por causa de um buraco real: a solicitação de verdade é feita à mão no
 * Portal do Desenvolvedor, um CNPJ por vez. Num lote de 14 lojas é questão de
 * tempo até uma passar batido — e aí ela fica em 'solicitada' pra sempre. O
 * cliente aprova o que aparece no portal dele, as que faltam ninguém cobra, e
 * nenhum dos dois lados descobre: pro cliente é "ainda não conectou", pra fila
 * interna é "com o cliente".
 *
 * Voltar pra 'pendente' recoloca a linha como SUA VEZ no painel — que é o
 * único jeito de a loja esquecida reaparecer no radar de quem pode agir.
 */
export async function reportarLojaNaoApareceu(
  _prev: SolicitacaoIfoodState,
  formData: FormData,
): Promise<SolicitacaoIfoodState> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>["admin"]
  try {
    admin = (await requireAdmin()).admin
  } catch {
    return { ok: false, message: "Só administradores podem reportar." }
  }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não identificada." }

  // A faixa espelha o pedido nas lojas irmãs do CNPJ com id composto
  // "pedido:unidade" — aqui interessa só o pedido.
  const id = String(formData.get("id") ?? "").trim().split(":")[0]
  if (!id) return { ok: false, message: "Solicitação não informada." }

  // Escopo duplo: a solicitação é da holding dela E de uma unidade que ela
  // enxerga. Sem isso, um id chutado mexeria na fila de outro cliente.
  const { data: alvo } = await admin
    .from("ifood_activation_requests")
    .select("id, unit_id, status")
    .eq("id", id)
    .eq("holding_id", holdingId)
    .maybeSingle()
  if (!alvo) return { ok: false, message: "Solicitação não encontrada." }
  if (alvo.status !== "solicitada") {
    return {
      ok: false,
      message: "Essa loja não está aguardando aprovação no iFood.",
    }
  }
  const acessiveis = await getAccessibleUnitIds()
  if (
    acessiveis !== null &&
    alvo.unit_id &&
    !acessiveis.includes(alvo.unit_id as string)
  ) {
    return { ok: false, message: "Unidade inválida." }
  }

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status: "pendente",
      status_anterior: "solicitada",
      // Zera a confirmação: ele confirmou aprovação de um lote em que ESTA
      // loja não estava. Manter o carimbo faria a fila jurar que ela já foi
      // aprovada, que é justamente a mentira que trouxe a gente até aqui.
      cliente_confirmou_at: null,
      nota: "O cliente reportou que esta loja não apareceu no Portal do Parceiro dele — refazer a solicitação no Portal do Desenvolvedor.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, message: `Falha: ${error.message}` }

  revalidatePath("/inicio")
  revalidatePath("/unidades")
  return {
    ok: true,
    message: "Avisamos a equipe — vamos refazer a solicitação dessa loja.",
  }
}
