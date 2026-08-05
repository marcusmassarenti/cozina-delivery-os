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
    message:
      "Loja vinculada! O cron diário já passa a trazer o financeiro dela — o histórico entra na próxima rodada.",
  }
}
