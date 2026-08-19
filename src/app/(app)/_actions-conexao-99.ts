"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"

export type Confirmacao99 = {
  ok: boolean
  /** Conectou de verdade nesta chamada. */
  conectou?: boolean
  message?: string
  error?: string
}

/**
 * "Já autorizei" — o lojista avisa, e a gente CONFERE NA HORA.
 *
 * ── POR QUE (Marcus, 19/08/26): "ele terá um botão pra avisar que conectou?"
 * Não tinha, e no 99 isso dói mais que no iFood: o 99 não nos manda nada
 * quando alguém autoriza. Sem um sinal do cliente, a loja ficava esperando
 * alguém do nosso lado clicar "Verificar quem já autorizou" por acaso — o
 * lojista fazia a parte dele e não acontecia nada.
 *
 * Aqui o botão não só avisa: ele PERGUNTA AO 99 na mesma hora. Como a resposta
 * do portal é imediata, dá pra fechar o ciclo sem ninguém no meio:
 *
 *  • uma loja nova sem dono → vincula e responde "conectado";
 *  • várias → NÃO adivinha (apontar errado joga o financeiro de uma loja na
 *    outra) e deixa o carimbo pra gente escolher;
 *  • nenhuma → diz honestamente que o 99 ainda não mostra, em vez de fingir
 *    que deu certo.
 */
export async function confirmeiAutorizacao99(
  _prev: Confirmacao99,
  formData: FormData,
): Promise<Confirmacao99> {
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, error: "Pedido não informado." }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from("ninefood_activation_requests")
    .select("id, unit_id, status")
    .eq("id", id)
    .maybeSingle()
  if (!req?.unit_id) return { ok: false, error: "Pedido não encontrado." }

  // A loja precisa ser do próprio usuário. Sem isto, qualquer cliente logado
  // poderia confirmar (e vincular) a loja de outro.
  const acessiveis = await getAccessibleUnitIds()
  if (acessiveis !== null && !acessiveis.includes(req.unit_id as string)) {
    return { ok: false, error: "Essa loja não é da sua conta." }
  }

  const agora = new Date().toISOString()
  await admin
    .from("ninefood_activation_requests")
    .update({ cliente_confirmou_at: agora, updated_at: agora })
    .eq("id", id)

  // Confere no portal. Falhar aqui não invalida o aviso — o carimbo acima já
  // avisou a gente, que é o mínimo que este botão precisa garantir.
  let livres: { appShopId: string; shopId: string }[] = []
  try {
    const { listarLojas99 } = await import("@/lib/ninefood/lojas")
    const lojas = await listarLojas99()
    const { data: links } = await admin
      .from("ninefood_store_links")
      .select("app_shop_id, unit_id")
    const comDono = new Set(
      ((links ?? []) as { app_shop_id: string; unit_id: string | null }[])
        .filter((l) => l.unit_id)
        .map((l) => l.app_shop_id),
    )
    livres = lojas.filter((l) => !comDono.has(l.appShopId))
  } catch (e) {
    console.error("confirmeiAutorizacao99 (lista):", e)
    revalidatePath("/inicio")
    return {
      ok: true,
      message:
        "Recebemos! Não consegui conferir no 99 agora — a gente confirma e te avisa.",
    }
  }

  if (livres.length === 1) {
    const alvo = livres[0]!
    await admin.from("ninefood_store_links").upsert(
      {
        app_shop_id: alvo.appShopId,
        unit_id: req.unit_id,
        active: true,
        id_loja: alvo.shopId,
      },
      { onConflict: "app_shop_id" },
    )
    await admin
      .from("ninefood_activation_requests")
      .update({ status: "ativa", updated_at: agora })
      .eq("id", id)
    revalidatePath("/inicio")
    revalidatePath("/integracao/99food")
    return {
      ok: true,
      conectou: true,
      message: "Conectado! Já estamos trazendo o histórico dessa loja.",
    }
  }

  revalidatePath("/inicio")
  revalidatePath("/integracao/99food")
  return {
    ok: true,
    message:
      livres.length === 0
        ? "Recebemos, mas o 99 ainda não mostra a autorização. Confira se autorizou com o usuário dono da loja e nesta loja específica — se já fez, a gente acompanha e conecta assim que aparecer."
        : "Recebemos! O 99 devolveu mais de uma loja nova — vamos confirmar qual é a sua e ligar, pra não trocar o financeiro de lugar.",
  }
}
