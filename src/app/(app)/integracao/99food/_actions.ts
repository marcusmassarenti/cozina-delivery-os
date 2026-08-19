"use server"

/**
 * Fila de ativação do 99 Food — lado do ADMIN.
 *
 * Deliberadamente mais enxuta que a do iFood, porque o fluxo é outro. Lá dá
 * pra perguntar à API quais lojas já autorizaram (`GET /merchants`) e vincular
 * sozinho. Aqui não existe esse endpoint: o `app_shop_id` é definido no portal
 * do 99 e chega até nós por fora (e-mail, planilha, whatever). Então o passo
 * que importa é COLAR esse id e criar o vínculo — que era exatamente o INSERT
 * escrito à mão na migration 0058.
 *
 * Por isso "ativar" aqui não é só mudar um rótulo: sem o vínculo em
 * `ninefood_store_links`, marcar "ativa" seria mentira — nenhuma sincronização
 * aconteceria e o cliente veria "conectado" sem dado nenhum entrando.
 */
import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperadmin } from "@/lib/auth/guards"

export type Solicitacao99State = {
  ok: boolean
  error?: string
  message?: string
}

type Status = "pendente" | "solicitada" | "ativa" | "recusada"

/** Move a solicitação de status. Não toca no vínculo — ver `vincularLoja99`. */
export async function atualizarSolicitacao99(
  _prev: Solicitacao99State,
  formData: FormData,
): Promise<Solicitacao99State> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Só o dono da plataforma pode fazer isso." }
  }

  const id = String(formData.get("id") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim() as Status
  const nota = String(formData.get("nota") ?? "").trim() || null
  if (!id) return { ok: false, error: "Solicitação não informada." }
  if (!["pendente", "solicitada", "ativa", "recusada"].includes(status)) {
    return { ok: false, error: "Status inválido." }
  }

  // "ativa" só pela ação de vincular: é lá que o app_shop_id entra. Sem ele a
  // loja não sincroniza, e o cliente veria "conectada" sem dado nenhum.
  if (status === "ativa") {
    return {
      ok: false,
      error:
        'Pra ativar, use "Vincular loja" e informe o app_shop_id que o 99 devolveu — é ele que faz a sincronização acontecer.',
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ninefood_activation_requests")
    .update({ status, nota, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/99food")
  revalidatePath("/clientes/conexoes")
  revalidatePath("/unidades")
  return { ok: true, message: "Status atualizado." }
}

/**
 * Recebe o `app_shop_id` que o 99 autorizou, cria o vínculo e fecha o pedido.
 *
 * Idempotente por `app_shop_id` (chave primária de ninefood_store_links): se o
 * id já existir apontando pra outra unidade, isso é conflito de verdade e
 * merece erro claro — repontar sem avisar faria o financeiro de uma loja
 * aparecer na outra.
 */
/**
 * Pede AO CLIENTE que autorize o Delivery OS no portal do 99.
 *
 * ── POR QUE (Marcus, 19/08/26) ───────────────────────────────────────────
 * Quando a loja não aparece no `/v1/shop/list`, a conclusão é uma só: o
 * lojista não autorizou. Só que não havia como cutucá-lo de dentro do sistema
 * — o jeito era sair, achar o contato e escrever à mão, e é aí que o
 * onboarding para por dias sem ninguém perceber.
 *
 * Faz as duas coisas de uma vez: manda o e-mail E deixa o pedido em
 * "solicitada", que é o estado que acende a faixa na tela de Início DELE. Um
 * canal só não basta: e-mail some na caixa, faixa só aparece se ele entrar.
 *
 * Nunca derruba o status por causa do e-mail — o texto de retorno diz se o
 * aviso saiu, pra quem clicou não ficar no escuro.
 */
export async function avisarClienteAutorizar99(
  _prev: Solicitacao99State,
  formData: FormData,
): Promise<Solicitacao99State> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Só o dono da plataforma pode fazer isso." }
  }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, error: "Solicitação não informada." }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from("ninefood_activation_requests")
    .select("cnpj, holding_id, unit_id, units(name)")
    .eq("id", id)
    .maybeSingle()
  if (!req) return { ok: false, error: "Solicitação não encontrada." }

  await admin
    .from("ninefood_activation_requests")
    .update({ status: "solicitada", updated_at: new Date().toISOString() })
    .eq("id", id)

  let aviso = "Não avisei por e-mail: solicitação sem empresa."
  const holdingId = (req as { holding_id: string | null }).holding_id
  if (holdingId) {
    try {
      const { contatoDaHolding } = await import("@/lib/email/contato-holding")
      const { enviarEmail } = await import("@/lib/email/enviar")
      const { conexaoSolicitada99 } = await import("@/lib/email/templates")
      const contato = await contatoDaHolding(holdingId)
      if (!contato) {
        aviso =
          "Não avisei por e-mail: a empresa não tem administrador com e-mail confirmado."
      } else {
        const loja =
          (req as { units?: { name?: string } | null }).units?.name ?? null
        const { assunto, html } = conexaoSolicitada99({
          nome: contato.nome,
          loja,
          cnpj: String((req as { cnpj: string }).cnpj ?? ""),
        })
        const r = await enviarEmail({
          holdingId,
          tipo: "conexao-solicitada-99",
          para: contato.email,
          assunto,
          html,
          // Um cliente com várias lojas tem um pedido por loja: sem forçar, o
          // segundo seria engolido como repetido e ele nunca saberia.
          forcar: true,
        })
        aviso = r.ok
          ? `Avisei ${contato.email} por e-mail.${
              r.logErro ? ` ⚠️ Não registrei no log: ${r.logErro}` : ""
            }`
          : `Não consegui avisar por e-mail: ${r.erro ?? "falha no envio"}.`
      }
    } catch (e) {
      console.error("avisarClienteAutorizar99", e)
      aviso = "Não consegui avisar por e-mail (erro interno)."
    }
  }

  revalidatePath("/integracao/99food")
  revalidatePath("/inicio")
  return { ok: true, message: `Pedido marcado como solicitado. ${aviso}` }
}

export type Verificacao99 = {
  ok: boolean
  /** Lojas que o 99 já autorizou e que ainda não estão apontadas pra ninguém. */
  livres?: { appShopId: string; shopId: string }[]
  /** Quantas o portal devolveu no total (autorizadas, vinculadas ou não). */
  total?: number
  message?: string
  error?: string
}

/**
 * Pergunta AO 99 quem já autorizou — em vez de esperar o cliente avisar.
 *
 * ── POR QUE (Marcus, 19/08/26): "aqui não apareceu pra mim" ──────────────
 * O único caminho era digitar o `app_shop_id` à mão num campo livre, e o id do
 * 99 é um slug parecido entre lojas do mesmo cliente ("dg-acaiepastelaria-01"
 * vs "dg-donnatatta-01"). Colar o da loja errada aponta o financeiro de uma
 * pra outra — e a mensagem de erro só aparece se o id já estiver em uso.
 *
 * Aqui a lista vem do portal e já sai FILTRADA pelo que ainda não tem dono, que
 * é exatamente o conjunto de onde a resposta pode sair. Vazio é resposta útil
 * também: significa que o cliente ainda não autorizou, e aí o que falta é
 * cutucar ele, não procurar id.
 *
 * ⚠️ Uma chamada por vez: o `/v1/shop/list` do 99 aceita ~1 a cada 20 s.
 */
export async function verificarLojas99(): Promise<Verificacao99> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Só o dono da plataforma pode fazer isso." }
  }

  let lojas: { appShopId: string; shopId: string }[]
  try {
    const { listarLojas99 } = await import("@/lib/ninefood/lojas")
    lojas = await listarLojas99()
  } catch (e) {
    return {
      ok: false,
      error: `Não consegui falar com o 99: ${
        e instanceof Error ? e.message : "erro desconhecido"
      }`,
    }
  }

  const admin = createAdminClient()
  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
  const comDono = new Set(
    ((links ?? []) as { app_shop_id: string; unit_id: string | null }[])
      .filter((l) => l.unit_id)
      .map((l) => l.app_shop_id),
  )

  const livres = lojas.filter((l) => !comDono.has(l.appShopId))
  return {
    ok: true,
    livres,
    total: lojas.length,
    message:
      livres.length > 0
        ? `O 99 devolveu ${lojas.length} loja(s) autorizada(s); ${livres.length} ainda sem unidade.`
        : `O 99 devolveu ${lojas.length} loja(s), todas já vinculadas. A loja nova ainda não foi autorizada — peça ao cliente pra autorizar o Delivery OS no portal do 99.`,
  }
}

export async function vincularLoja99(
  _prev: Solicitacao99State,
  formData: FormData,
): Promise<Solicitacao99State> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Só o dono da plataforma pode fazer isso." }
  }

  const id = String(formData.get("id") ?? "").trim()
  const appShopId = String(formData.get("app_shop_id") ?? "").trim()
  if (!id) return { ok: false, error: "Solicitação não informada." }
  if (!appShopId) {
    return { ok: false, error: "Informe o app_shop_id que o 99 devolveu." }
  }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from("ninefood_activation_requests")
    .select("unit_id, loja_99")
    .eq("id", id)
    .maybeSingle()
  if (!req?.unit_id) {
    return { ok: false, error: "Essa solicitação não tem unidade vinculada." }
  }

  const { data: existente } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
    .eq("app_shop_id", appShopId)
    .maybeSingle()
  if (existente && existente.unit_id && existente.unit_id !== req.unit_id) {
    return {
      ok: false,
      error: `Esse app_shop_id já está vinculado a outra loja. Confira antes — repontar faria o financeiro de uma aparecer na outra.`,
    }
  }

  const { error: errLink } = await admin.from("ninefood_store_links").upsert(
    {
      app_shop_id: appShopId,
      unit_id: req.unit_id,
      name: (req.loja_99 as string | null) ?? null,
      active: true,
    },
    { onConflict: "app_shop_id" },
  )
  if (errLink) return { ok: false, error: errLink.message }

  /**
   * Backfill NA HORA — a regra do Marcus (18/08/26): "loja vinculada tem que
   * rodar backfill imediato". Sem isto o vínculo nasce mudo e a loja fica
   * zerada até o cron das 5h; foi o que aconteceu com a Donna Tatta e a Açaí
   * RG Estilo em 19/08, vinculadas de tarde e sem uma linha à noite.
   *
   * Não derruba o vínculo se falhar: o que ficar sem carimbo o cron recolhe.
   */
  let historico = ""
  try {
    const { backfillDeUmaLoja99 } = await import("@/lib/ninefood/backfill")
    const r = await backfillDeUmaLoja99(appShopId)
    if (r) {
      historico = r.concluido
        ? ` Histórico: ${r.meses} meses, ${r.linhas} linhas.`
        : ` ⚠️ O histórico veio incompleto (${r.erros.join(" · ")}) — o cron tenta de novo.`
    }
  } catch (e) {
    console.error("[99] backfill ao vincular:", e)
    historico = " O histórico entra na próxima rodada."
  }

  const { error } = await admin
    .from("ninefood_activation_requests")
    .update({ status: "ativa", updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/99food")
  revalidatePath("/clientes/conexoes")
  revalidatePath("/unidades")
  return {
    ok: true,
    message: `Loja vinculada! O cron diário já traz o financeiro dela.${historico}`,
  }
}
