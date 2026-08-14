"use server"

import { revalidatePath } from "next/cache"

import { requireSuperadmin } from "@/lib/auth/guards"
import { autoLinkIfoodMerchants } from "@/lib/ifood/auto-link"
import {
  getIfoodMerchant,
  listAllIfoodMerchants,
  type IfoodMerchant,
} from "@/lib/ifood/merchants"
import { createAdminClient } from "@/lib/supabase/admin"

export type RefreshMerchantsState = {
  ok: boolean
  count?: number
  /** Quantos tiveram cidade/UF/status preenchidos pelo detalhe. */
  enriquecidos?: number
  status?: number
  error?: string
}

/** Roda `fn` sobre a lista com no máximo `limite` chamadas simultâneas. */
async function mapComLimite<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(itens.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= itens.length) return
        try {
          out[i] = await fn(itens[i])
        } catch {
          out[i] = null as R
        }
      }
    }),
  )
  return out
}

/**
 * Re-puxa merchants da Merchant API + UPSERT na cache local (`ifood_merchants`).
 * Funciona como "F5" da listagem.
 */
export async function refreshMerchants(
  _prev: RefreshMerchantsState,
  _formData: FormData,
): Promise<RefreshMerchantsState> {
  try {
    const r = await listAllIfoodMerchants()
    if (!r.ok || !r.data) {
      revalidatePath("/integracao/ifood-merchants")
      return {
        ok: false,
        status: r.status,
        error: r.error ?? `HTTP ${r.status}`,
      }
    }
    const admin = createAdminClient()
    const rows = (r.data as IfoodMerchant[]).map((m) => ({
      id: m.id,
      name: m.name ?? null,
      corporate_name: m.corporateName ?? null,
      // NÃO grava cnpj aqui: a Merchant API não devolve documents/CNPJ, então
      // isso sempre viria null e APAGARIA o CNPJ que o auto-vínculo descobriu
      // pela Conciliação (que é a única fonte real). Só preenche se vier algo.
      ...(m.documents?.CNPJ?.value
        ? { cnpj: m.documents.CNPJ.value }
        : {}),
      city: m.address?.city ?? null,
      state: m.address?.state ?? null,
      merchant_state: m.merchantState ?? null,
      raw: m as unknown as object,
      last_seen_at: new Date().toISOString(),
    }))
    if (rows.length > 0) {
      await admin
        .from("ifood_merchants")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: false })
    }

    // A LISTA só devolve id/name/corporateName — cidade, UF e status da loja
    // vêm apenas no DETALHE de cada merchant. Por isso a coluna Cidade vivia
    // vazia: não era dado faltando no iFood, era endpoint errado.
    // 4 por vez pra não maltratar a API; falha de um não derruba o resto.
    const detalhes = await mapComLimite(r.data as IfoodMerchant[], 4, async (m) => {
      const d = await getIfoodMerchant(m.id)
      if (!d.ok || !d.data) return null
      const det = d.data
      return {
        id: m.id,
        city: det.address?.city ?? null,
        state: det.address?.state ?? null,
        // O detalhe chama de `status`; `merchantState` é o nome antigo. Ler os
        // dois evita a coluna vazia se o iFood alternar entre eles.
        merchant_state: det.status ?? det.merchantState ?? null,
        // CNPJ raramente vem aqui (a fonte confiável é a Conciliação, via
        // auto-link). Só grava se vier — nunca sobrescreve com null.
        ...(det.documents?.CNPJ?.value
          ? { cnpj: det.documents.CNPJ.value }
          : {}),
      }
    })
    const comDetalhe = detalhes.filter(
      (d): d is NonNullable<typeof d> => d !== null,
    )
    for (const d of comDetalhe) {
      const { id, ...campos } = d
      await admin.from("ifood_merchants").update(campos).eq("id", id)
    }

    revalidatePath("/integracao/ifood-merchants")
    return {
      ok: true,
      status: r.status,
      count: r.data.length,
      enriquecidos: comDetalhe.length,
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-merchants")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type ConferirAutorizadasState = {
  ok: boolean
  /** Lojas vinculadas E ativadas nesta rodada. */
  vinculadas?: { code: string; name: string }[]
  /** Ficaram de fora e por quê — o admin resolve na tabela. */
  pendentes?: { name: string; motivo: string }[]
  merchantsVistos?: number
  /** Sobraram por falta de tempo — clicar de novo continua de onde parou. */
  restantes?: number
  error?: string
}

/**
 * "Já autorizei no iFood — conferir e vincular."
 *
 * Faz de uma vez o que antes exigia descer na tabela e vincular loja por loja:
 * re-puxa os merchants autorizados, casa com as unidades que têm solicitação
 * aberta e marca como ativa quem casou.
 *
 * Por que existe: depois que o cliente aprova no Portal do Parceiro, a loja só
 * aparece no nosso GET /merchants alguns minutos depois. Até o cron da
 * madrugada rodar, a fila mostrava "Loja vinculada — ativar" e o clique
 * respondia "esta loja ainda NÃO está vinculada" — o operador não tinha como
 * saber que faltava só ir buscar. Agora tem o botão que vai buscar.
 *
 * Não dispara o backfill do histórico (~2min/loja, estoura o timeout de 300s).
 * As lojas recém-vinculadas pegam mês corrente + anterior no próximo sync, e o
 * histórico completo no cron diário.
 *
 * ⏱️ Roda com teto de 45s. Descobrir o CNPJ de um merchant custa o DOWNLOAD de
 * uma conciliação, e com o cache frio isso passa dos 300s da server action e
 * morre sem gravar nada. Com o teto, cada clique grava o que conseguiu e diz
 * quantas faltam — e como o CNPJ descoberto fica em cache, o clique seguinte
 * anda muito mais.
 */
export async function conferirLojasAutorizadas(
  _prev: ConferirAutorizadasState,
  _formData: FormData,
): Promise<ConferirAutorizadasState> {
  await requireSuperadmin()
  try {
    const r = await autoLinkIfoodMerchants(null, { deadlineMs: 45_000 })
    revalidatePath("/integracao/ifood-merchants")
    revalidatePath("/importacao")
    if (!r.ok) {
      return { ok: false, error: r.error ?? "Falha ao consultar o iFood." }
    }
    return {
      ok: true,
      merchantsVistos: r.merchantsVistos,
      restantes: r.restantes,
      vinculadas: r.vinculadas.map((v) => ({
        code: v.unitCode,
        name: v.unitName,
      })),
      pendentes: r.ambiguas.map((a) => ({
        name: a.unitName,
        motivo: a.motivo,
      })),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type LinkMerchantState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Vincula um merchant do iFood a uma unidade da rede.
 *
 * UPSERT em unit_platforms (unit_id, platform='ifood'):
 *   - Se a row não existe, cria com active=true e api_store_id setado.
 *   - Se existe, atualiza api_store_id.
 *
 * Carimba os DOIS apps junto, igual ao auto-vínculo: a conexão entrega
 * financeiro e avaliações de uma vez, e são esses carimbos que fazem a
 * cobertura parar de cobrar a planilha. Vincular por aqui sem marcá-los
 * deixava a loja puxando tudo pela API enquanto o cliente continuava vendo
 * "falta importar" — aconteceu com a Nosso Brownie em 27/jul.
 */
export async function linkMerchantToUnit(
  _prev: LinkMerchantState,
  formData: FormData,
): Promise<LinkMerchantState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const unitId = String(formData.get("unitId") ?? "").trim()
  if (!merchantId) return { ok: false, error: "merchantId ausente" }
  if (!unitId) return { ok: false, error: "Selecione uma unidade" }

  try {
    const admin = createAdminClient()
    const agora = new Date().toISOString()
    const { error } = await admin.from("unit_platforms").upsert(
      {
        unit_id: unitId,
        platform: "ifood",
        active: true,
        api_store_id: merchantId,
        fin_enabled_at: agora,
        review_enabled_at: agora,
      },
      { onConflict: "unit_id,platform", ignoreDuplicates: false },
    )
    if (error) return { ok: false, error: error.message }

    /* Vincular É habilitar o sync. Liga `api_sync_enabled` na holding.
     *
     * Sem isto a conexão ficava PELA METADE: o vínculo existia, a loja podia
     * puxar dado, e o cliente não via botão de Sincronizar nenhum — porque o
     * botão depende dessa flag. Pior: a faixa de cobertura dizia "falta
     * importar iFood" numa loja já conectada, mandando ele subir planilha à
     * toa.
     *
     * Achado em 07/ago/26 com a Vbfood, e não era caso isolado: a "Empreender
     * com Delivery" estava no mesmo estado. Os dois corrigidos no banco.
     *
     * Falha "de leve": se não conseguir ligar a flag, o vínculo NÃO é
     * desfeito — a loja conectada vale mais que o botão, e o estado antigo era
     * exatamente esse. */
    try {
      const { data: u } = await admin
        .from("units")
        .select("brands(holding_id)")
        .eq("id", unitId)
        .maybeSingle()
      const hId = (u as { brands?: { holding_id?: string } } | null)?.brands
        ?.holding_id
      if (hId) {
        await admin
          .from("holdings")
          .update({ api_sync_enabled: true })
          .eq("id", hId)
      }
    } catch (e) {
      console.error("[link-merchant] falhou ao ligar api_sync_enabled:", e)
    }

    // Vincular É conectar: a solicitação daquela loja fecha junto.
    //
    // Sem isto, a loja passava a puxar dado normalmente e mesmo assim seguia na
    // fila como "com o cliente" — e o cliente via "falta você aprovar no Portal
    // do Parceiro" numa loja que já estava funcionando. Só o caminho automático
    // fechava; o manual deixava os dois lados olhando um estado que não existia
    // mais.
    const { data: fechadas } = await admin
      .from("ifood_activation_requests")
      .update({ status: "ativa", updated_at: agora })
      .eq("unit_id", unitId)
      .in("status", ["pendente", "solicitada"])
      .select("id")

    /* Avisa o cliente que a loja está conectada, com o que já entrou.
     *
     * O caminho AUTOMÁTICO (cron de auto-vínculo) já mandava esse e-mail; o
     * manual, não. Então a loja vinculada aqui na mão conectava em silêncio: o
     * dado começava a entrar e o cliente só descobria se abrisse o painel por
     * conta própria — justo no momento em que ele está esperando notícia.
     *
     * `soSeCompleto` segura o envio enquanto não há dado. O e-mail sai UMA vez
     * por (loja, plataforma) e leva os números dentro; mandá-lo vazio queimaria
     * a única chance pra dizer "conectado" sem mostrar nada. Se ainda não
     * entrou nada, a varredura das 7h manda quando entrar.
     *
     * Não derruba o vínculo se falhar: a loja conectada vale mais que o aviso.
     */
    let aviso = ""
    try {
      const { avisarConexaoAtivada } = await import(
        "@/lib/email/conexao-ativada"
      )
      await avisarConexaoAtivada(unitId, "ifood", { soSeCompleto: true })
      aviso = " O cliente foi avisado por e-mail (ou será, quando o primeiro dado entrar)."
    } catch (e) {
      console.error("[link-merchant] aviso de conexão:", e)
    }

    revalidatePath("/integracao/ifood-merchants")
    revalidatePath("/importacao")
    revalidatePath("/inicio")
    return {
      ok: true,
      message: `Vinculado — financeiro e avaliações ligados.${
        (fechadas ?? []).length > 0 ? " Solicitação encerrada." : ""
      }${aviso}`,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type IgnorarMerchantState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Arquiva (ou desarquiva) um merchant que não vai virar unidade da rede.
 *
 * Nem toda loja autorizada no app vira loja nossa: tem a de teste do próprio
 * integrador e a que o cliente desativou. Sem isso elas moravam pra sempre no
 * bloco "Sem unidade vinculada", que é justamente a lista do que exige ação.
 *
 * É carimbo e não DELETE porque apagar não resolve — no próximo "Re-puxar da
 * Merchant API" a loja volta, já que continua autorizada no iFood.
 */
export async function ignorarMerchant(
  _prev: IgnorarMerchantState,
  formData: FormData,
): Promise<IgnorarMerchantState> {
  await requireSuperadmin()
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const desfazer = String(formData.get("desfazer") ?? "") === "1"
  const motivo = String(formData.get("motivo") ?? "").trim() || null
  if (!merchantId) return { ok: false, error: "merchantId ausente" }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("ifood_merchants")
      .update(
        desfazer
          ? { ignorado_em: null, ignorado_motivo: null }
          : { ignorado_em: new Date().toISOString(), ignorado_motivo: motivo },
      )
      .eq("id", merchantId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/integracao/ifood-merchants")
    return {
      ok: true,
      message: desfazer ? "De volta à lista." : "Arquivada.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Remove o vínculo (zera o api_store_id, mantém active da unit_platforms). */
export async function unlinkMerchant(
  _prev: LinkMerchantState,
  formData: FormData,
): Promise<LinkMerchantState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  if (!merchantId) return { ok: false, error: "merchantId ausente" }
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("unit_platforms")
      .update({ api_store_id: null })
      .eq("platform", "ifood")
      .eq("api_store_id", merchantId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/integracao/ifood-merchants")
    return { ok: true, message: "Desvinculado." }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ─── Fila de solicitações de ativação (autoatendimento dos clientes) ────

export type SolicitacaoUpdateState = {
  ok: boolean
  error?: string
  message?: string
}

/**
 * Atualiza o status de uma solicitação de conexão iFood.
 *
 * pendente → solicitada: você enviou a solicitação no Portal do
 * Desenvolvedor (aba Permissões, busca por CNPJ) — o cliente passa a ver
 * "aprove no seu Portal do Parceiro".
 * solicitada → ativa: a loja apareceu no GET /merchants e foi vinculada.
 * → recusada: use a nota pra explicar (aparece pro cliente).
 */
export async function atualizarSolicitacaoIfood(
  _prev: SolicitacaoUpdateState,
  formData: FormData,
): Promise<SolicitacaoUpdateState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const id = String(formData.get("id") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()
  const nota = String(formData.get("nota") ?? "").trim() || null

  if (!id) return { ok: false, error: "id ausente" }
  // "arquivada" = resolvida, sai da fila sem apagar (ver migration 0152).
  if (
    !["pendente", "solicitada", "ativa", "recusada", "arquivada"].includes(
      status,
    )
  ) {
    return { ok: false, error: "status inválido" }
  }

  const admin = createAdminClient()

  // GUARDA: "ativa" significa loja CONECTADA. Este botão só fecha a
  // solicitação — quem cria o vínculo é a tabela de merchants abaixo (ou o
  // auto-vínculo). Sem esta checagem dava pra marcar ativa sem vínculo
  // nenhum: a fila dizia "conectada", o cliente via "sua loja foi
  // conectada" e o sync nunca puxava nada. Aconteceu de verdade com 4
  // lojas da DG Foods (23/jul).
  if (status === "ativa") {
    const { data: req } = await admin
      .from("ifood_activation_requests")
      .select("unit_id")
      .eq("id", id)
      .maybeSingle()
    const unitId = (req?.unit_id as string | null) ?? null
    if (!unitId) {
      return {
        ok: false,
        error: "Solicitação sem unidade — não dá pra ativar.",
      }
    }
    const { data: vinc } = await admin
      .from("unit_platforms")
      .select("api_store_id")
      .eq("unit_id", unitId)
      .eq("platform", "ifood")
      .maybeSingle()
    if (!vinc?.api_store_id) {
      return {
        ok: false,
        error:
          'Esta loja ainda não apareceu no nosso app. Clique em "Já autorizei — conferir e vincular" no topo: ele busca no iFood e vincula sozinho. Se mesmo assim não achar, vincule na tabela abaixo (escolher unidade → Vincular).',
      }
    }
  }

  // Guarda de onde veio, pro Desfazer restaurar o passo certo da fila.
  const { data: atual } = await admin
    .from("ifood_activation_requests")
    .select("status, holding_id, cnpj, units(name)")
    .eq("id", id)
    .maybeSingle()

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status,
      nota,
      status_anterior: (atual?.status as string | null) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  // Avisa por e-mail SÓ quando a recusa é nova. Reescrever o aviso de uma
  // recusa que já existe (botão "Salvar aviso") não dispara nada — senão
  // corrigir uma vírgula manda outro e-mail pro cliente.
  let avisoEmail: string | null = null
  // "Marquei como solicitada" = pedi no Portal do Desenvolvedor e agora a bola
  // é do cliente: ele precisa autorizar o app no Portal do Parceiro DELE. Sem
  // e-mail ele só descobre isso se entrar no sistema -- e quem está esperando
  // a conexão funcionar não entra, fica achando que estamos processando.
  //
  // Mesma guarda da recusa: só dispara quando o status MUDA pra solicitada.
  // Reclicar o botão (ou salvar um aviso) não manda outro e-mail.
  if (status === "solicitada" && atual?.status !== "solicitada") {
    avisoEmail = await avisarSolicitacaoPorEmail({
      holdingId: (atual?.holding_id as string | null) ?? null,
      cnpj: (atual?.cnpj as string | null) ?? "",
      loja:
        ((atual?.units as { name?: string } | null)?.name as string | null) ??
        null,
    })
  }
  if (status === "recusada" && atual?.status !== "recusada") {
    avisoEmail = await avisarRecusaPorEmail({
      holdingId: (atual?.holding_id as string | null) ?? null,
      cnpj: (atual?.cnpj as string | null) ?? "",
      loja:
        ((atual?.units as { name?: string } | null)?.name as string | null) ??
        null,
      motivo: nota,
    })
  }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return {
    ok: true,
    message: avisoEmail ? `Status atualizado. ${avisoEmail}` : "Status atualizado.",
  }
}

/**
 * Avisa o cliente que a solicitação foi feita e falta ele aprovar no iFood.
 *
 * Irmã de avisarRecusaPorEmail e com as mesmas regras: nunca lança (o status
 * já foi gravado, e falhar o e-mail não pode parecer que a solicitação
 * falhou) e devolve texto pro operador saber se o cliente foi mesmo avisado.
 */
async function avisarSolicitacaoPorEmail(d: {
  holdingId: string | null
  cnpj: string
  loja: string | null
}): Promise<string> {
  if (!d.holdingId) return "Não avisei por e-mail: solicitação sem empresa."
  try {
    const { contatoDaHolding } = await import("@/lib/email/contato-holding")
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { conexaoSolicitada } = await import("@/lib/email/templates")

    const contato = await contatoDaHolding(d.holdingId)
    if (!contato) {
      return "Não avisei por e-mail: a empresa não tem administrador com e-mail confirmado."
    }

    const { assunto, html } = conexaoSolicitada({
      nome: contato.nome,
      loja: d.loja,
      cnpj: d.cnpj,
    })
    const r = await enviarEmail({
      holdingId: d.holdingId,
      tipo: "conexao-solicitada",
      para: contato.email,
      assunto,
      html,
      // Um cliente tem várias lojas, cada uma com o seu pedido: sem forçar, o
      // segundo CNPJ seria engolido como repetido e o dono nunca saberia que
      // tem outra loja esperando aprovação.
      forcar: true,
    })
    return r.ok
      ? `Avisei ${contato.email} por e-mail.`
      : `Não consegui avisar por e-mail: ${r.erro ?? "falha no envio"}.`
  } catch (e) {
    console.error("avisarSolicitacaoPorEmail", e)
    return "Não consegui avisar por e-mail (erro interno)."
  }
}

/**
 * Manda a recusa pro administrador da holding e devolve o que contar na tela.
 *
 * Nunca lança: o status já foi gravado quando isto roda, e falhar o e-mail não
 * pode desfazer a recusa nem parecer que a recusa falhou. O retorno é texto pra
 * quem recusou saber se o cliente foi mesmo avisado — sem isso o operador fica
 * achando que avisou quando não avisou.
 */
async function avisarRecusaPorEmail(d: {
  holdingId: string | null
  cnpj: string
  loja: string | null
  motivo: string | null
}): Promise<string> {
  if (!d.holdingId) return "Não avisei por e-mail: solicitação sem empresa."
  try {
    const { contatoDaHolding } = await import("@/lib/email/contato-holding")
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { conexaoRecusada } = await import("@/lib/email/templates")

    const contato = await contatoDaHolding(d.holdingId)
    if (!contato) {
      return "Não avisei por e-mail: a empresa não tem administrador com e-mail confirmado."
    }

    const { assunto, html } = conexaoRecusada({
      nome: contato.nome,
      loja: d.loja,
      cnpj: d.cnpj,
      motivo: d.motivo,
    })
    const r = await enviarEmail({
      holdingId: d.holdingId,
      tipo: "conexao-recusada",
      para: contato.email,
      assunto,
      html,
      // Pode recusar mais de uma vez o mesmo cliente (outro CNPJ errado).
      forcar: true,
    })
    return r.ok
      ? `Avisei ${contato.email} por e-mail.`
      : `Não consegui avisar por e-mail: ${r.erro ?? "falha no envio"}.`
  } catch (e) {
    console.error("avisarRecusaPorEmail", e)
    return "Não consegui avisar por e-mail (erro interno)."
  }
}

/**
 * Desfaz a última mudança de status, voltando ao passo anterior da fila.
 *
 * Existe porque "Recusar" fica colado em "Loja vinculada — ativar" e um
 * clique errado matava a conexão em silêncio: recusada some do aviso da home
 * do cliente, então ele para de ser lembrado de aprovar no Portal do Parceiro.
 *
 * Restaura `status_anterior` em vez de assumir um valor — a recusa pode ter
 * vindo de 'pendente' (antes de eu abrir o portal) ou de 'solicitada' (já
 * pedi, faltava ele aprovar), e voltar pro passo errado confunde os dois lados.
 */
export async function desfazerStatusIfood(
  _prev: SolicitacaoUpdateState,
  formData: FormData,
): Promise<SolicitacaoUpdateState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, error: "id ausente" }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from("ifood_activation_requests")
    .select("status, status_anterior")
    .eq("id", id)
    .maybeSingle()

  if (!req) return { ok: false, error: "Solicitação não encontrada." }

  // Sem histórico (recusa anterior a esta funcionalidade) volta pro INÍCIO da
  // fila, não pro passo que eu acharia provável. 'pendente' custa um clique a
  // mais se a solicitação no portal já tinha sido feita, mas não inventa um
  // estado — e enganar sobre "já pedi no portal" trava os dois lados esperando
  // um do outro.
  const anterior = (req.status_anterior as string | null) ?? "pendente"

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status: anterior,
      // A nota do passo desfeito vai junto: ela é o texto que o CLIENTE lê
      // ("não foi possível localizar a loja..."). Deixar para trás uma
      // explicação de recusa numa solicitação que voltou pra fila diria a ele
      // o oposto do que está acontecendo.
      nota: null,
      // Sem encadear desfazer: o passo anterior do passo anterior não é
      // guardado, e restaurar um valor velho daria a impressão de histórico
      // completo que não existe.
      status_anterior: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return { ok: true, message: `Voltou para "${anterior}".` }
}

// ─── Habilitação POR APP (financeiro vs avaliações) ─────────────────────

export type AppHabilitadoState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Marca/desmarca o "OK do admin" de um dos apps do iFood para uma loja.
 *
 * Por que existe: o vínculo (`api_store_id`) é único, mas cada app é
 * autorizado SEPARADAMENTE pelo lojista no Portal do Parceiro — dá pra ter o
 * financeiro funcionando e as avaliações voltando 403 (caso DG Foods). Este é
 * o passo final do processo: cliente manda o CNPJ → admin cadastra/vincula →
 * cliente autoriza os 2 apps no portal → admin confirma AQUI, um por um.
 */
export async function setAppHabilitado(
  _prev: AppHabilitadoState,
  formData: FormData,
): Promise<AppHabilitadoState> {
  await requireSuperadmin()
  const unitId = String(formData.get("unitId") ?? "").trim()
  const app = String(formData.get("app") ?? "").trim()
  const ligar = String(formData.get("ligar") ?? "") === "1"
  if (!unitId) return { ok: false, error: "unitId ausente" }
  if (app !== "financeiro" && app !== "avaliacoes") {
    return { ok: false, error: "app inválido" }
  }

  const coluna = app === "financeiro" ? "fin_enabled_at" : "review_enabled_at"
  const admin = createAdminClient()
  const { error } = await admin
    .from("unit_platforms")
    .update({ [coluna]: ligar ? new Date().toISOString() : null })
    .eq("unit_id", unitId)
    .eq("platform", "ifood")
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return {
    ok: true,
    message: ligar ? "Habilitado!" : "Desabilitado.",
  }
}

/**
 * Marca (ou desmarca) que o CNPJ já foi lançado no Portal do Desenvolvedor.
 *
 * É controle manual porque o passo é manual: o portal aceita um CNPJ por vez e
 * não devolve nada que a gente possa ler. Num lote de 14 lojas, "solicitada"
 * sozinha não diz se você já lançou aquela ou se ela ainda está esperando você
 * — e é exatamente aí que uma some.
 */
export async function marcarLancadoNoPortal(
  _prev: SolicitacaoUpdateState,
  formData: FormData,
): Promise<SolicitacaoUpdateState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, error: "id ausente" }
  const marcar = String(formData.get("marcar") ?? "") === "1"

  const { error } = await createAdminClient()
    .from("ifood_activation_requests")
    .update({ lancado_no_portal_at: marcar ? new Date().toISOString() : null })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  return { ok: true, message: marcar ? "Marcada como lançada." : "Desmarcada." }
}

export type CompartilharState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * "Essa loja já está na rede — compartilhar em vez de duplicar."
 *
 * O terceiro caminho que faltava na fila de solicitações. Ela só tinha
 * APROVAR e RECUSAR, e o caso real não é nenhum dos dois: um licenciado que
 * opera loja da rede pediu conexão de um CNPJ que JÁ está conectado na conta
 * de quem licencia. Aprovar criaria dois tenants gravando o mesmo faturamento
 * — mesmo merchant puxado duas vezes, dois extratos por dia, duas verdades que
 * divergem no primeiro import manual. Recusar manda e-mail de "recusada" e
 * conta pro cliente que deu errado, quando na verdade ele vai receber MAIS do
 * que pediu: a loja com o histórico inteiro, sem esperar autorização.
 *
 * O que faz, em uma passada:
 *  1. dá acesso de LEITURA da unidade que já existe ao usuário do cliente;
 *  2. arquiva a solicitação com a nota explicando (não recusa — não manda
 *     e-mail de recusa);
 *
 * Quem avisa o cliente é uma pessoa. Um e-mail automático dizendo "sua loja
 * foi compartilhada" numa situação que envolve dois donos diferentes pede
 * conversa, não template.
 */
export async function compartilharLojaExistente(
  solicitacaoId: string,
  unitId: string,
): Promise<CompartilharState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }
  if (!solicitacaoId || !unitId)
    return { ok: false, error: "Solicitação ou loja ausente." }

  const admin = createAdminClient()

  const { data: req } = await admin
    .from("ifood_activation_requests")
    .select("id, holding_id, cnpj, status")
    .eq("id", solicitacaoId)
    .maybeSingle()
  if (!req) return { ok: false, error: "Solicitação não encontrada." }
  const holdingId = (req as { holding_id: string | null }).holding_id
  if (!holdingId)
    return { ok: false, error: "Solicitação sem empresa — não dá pra compartilhar." }

  const { data: unidade } = await admin
    .from("units")
    .select("id, code, name, brands!inner(holding_id)")
    .eq("id", unitId)
    .maybeSingle()
  if (!unidade) return { ok: false, error: "Loja não encontrada." }

  const donaDaLoja = (
    unidade as unknown as { brands: { holding_id: string } }
  ).brands.holding_id

  // Compartilhar loja com a PRÓPRIA empresa não faz sentido: ali o acesso já
  // vem do escopo de holding, e criar a linha de leitura só serviria pra tirar
  // direito de quem já tinha.
  if (donaDaLoja === holdingId)
    return {
      ok: false,
      error: "Essa loja já é da mesma empresa — não há o que compartilhar.",
    }

  // Todo mundo da empresa que pediu. É a empresa que ganha o acompanhamento,
  // não uma pessoa — se o dono trocar de mão amanhã, o acesso continua com
  // quem ficou.
  const { data: pessoas } = await admin
    .from("user_unit_access")
    .select("user_id")
    .eq("scope_type", "holding")
    .eq("scope_id", holdingId)
  const userIds = [
    ...new Set(((pessoas ?? []) as { user_id: string }[]).map((p) => p.user_id)),
  ]
  if (userIds.length === 0)
    return { ok: false, error: "A empresa não tem nenhum usuário pra receber o acesso." }

  const { error: erroAcesso } = await admin.from("user_unit_access").upsert(
    userIds.map((user_id) => ({
      user_id,
      scope_type: "unit",
      scope_id: unitId,
      // 'viewer' é o que a 0186 transformou em "vê e não escreve". Sem isto,
      // o cliente entraria como administrador na loja emprestada e poderia
      // apagá-la — a unidade tem 44 tabelas em cascata.
      role: "viewer" as const,
    })),
    { onConflict: "user_id,scope_type,scope_id" },
  )
  if (erroAcesso) return { ok: false, error: erroAcesso.message }

  const u = unidade as unknown as { code: string; name: string }
  await admin
    .from("ifood_activation_requests")
    .update({
      status: "arquivada",
      status_anterior: (req as { status: string }).status,
      nota:
        `Loja já conectada na rede (#${u.code} ${u.name}). Em vez de duplicar a ` +
        `conexão, o acesso de leitura foi compartilhado com a empresa do cliente.`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", solicitacaoId)

  revalidatePath("/integracao/ifood-merchants")
  return {
    ok: true,
    message:
      `#${u.code} ${u.name} compartilhada com ${userIds.length} usuário` +
      `${userIds.length === 1 ? "" : "s"} do cliente, em modo leitura. ` +
      `Avise por mensagem — este botão não manda e-mail.`,
  }
}
