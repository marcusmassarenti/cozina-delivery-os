"use server"

import { revalidatePath } from "next/cache"

import { requireUnitWrite } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export type FluxoState = { ok: boolean; message?: string; error?: string }

type Etapa = "checklist" | "cardapio" | "encaminhar"

const COLUNA: Record<Etapa, string> = {
  checklist: "checklist_ok_em",
  cardapio: "cardapio_ok_em",
  encaminhar: "encaminhada_em",
}

/**
 * Avança ou desfaz uma etapa do fluxo da loja.
 *
 * ⚠️ ENCAMINHAR EXIGE AS DUAS ETAPAS FECHADAS, conferido NO SERVIDOR e não
 * só escondendo o botão. Botão desabilitado é conveniência da tela; a regra
 * de negócio tem que valer mesmo pra quem manda o formulário na mão.
 * "Conclua checklist e cardápio antes de encaminhar" é o que o painel deles
 * escreve em cima do bloco — é regra, não dica.
 */
export async function moverEtapa(
  _prev: FluxoState,
  formData: FormData,
): Promise<FluxoState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const codigo = String(formData.get("codigo") ?? "").trim()
  const etapa = String(formData.get("etapa") ?? "") as Etapa
  const desfazer = formData.get("desfazer") === "1"

  if (!unitId || !COLUNA[etapa]) {
    return { ok: false, error: "Etapa não reconhecida." }
  }
  await requireUnitWrite(unitId)
  const admin = createAdminClient()

  const { data: atual } = await admin
    .from("units")
    .select("checklist_ok_em, cardapio_ok_em, encaminhada_em")
    .eq("id", unitId)
    .maybeSingle()
  const u = (atual ?? {}) as {
    checklist_ok_em: string | null
    cardapio_ok_em: string | null
    encaminhada_em: string | null
  }

  if (etapa === "encaminhar" && !desfazer) {
    if (!u.checklist_ok_em || !u.cardapio_ok_em) {
      return {
        ok: false,
        error: "Conclua o checklist e o cardápio antes de encaminhar.",
      }
    }
  }

  /* Desfazer o checklist ou o cardápio DESFAZ o encaminhamento junto.
   *
   * Sem isso a loja ficaria "Ativa" com uma etapa aberta — um estado que a
   * tela não sabe desenhar e que ninguém consegue explicar depois. Voltar
   * atrás numa etapa é voltar atrás no que ela liberou. */
  const patch: Record<string, unknown> = {
    [COLUNA[etapa]]: desfazer ? null : new Date().toISOString(),
  }
  if (desfazer && etapa !== "encaminhar") {
    patch.encaminhada_em = null
    patch.categoria_carteira = "nova"
  }
  if (etapa === "encaminhar") {
    patch.categoria_carteira = desfazer ? "nova" : "ativa"
  }

  const { error } = await admin.from("units").update(patch).eq("id", unitId)
  if (error) return { ok: false, error: error.message }

  if (codigo) revalidatePath(`/unidades/${codigo}`)
  revalidatePath("/carteira/gestores")
  return {
    ok: true,
    message: desfazer ? "Etapa reaberta." : "Etapa concluída.",
  }
}

/** Promessa comercial e meta de 30 dias — campos que o comercial define. */
export async function salvarDadosCarteira(
  _prev: FluxoState,
  formData: FormData,
): Promise<FluxoState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const codigo = String(formData.get("codigo") ?? "").trim()
  if (!unitId) return { ok: false, error: "Loja não identificada." }
  await requireUnitWrite(unitId)

  const promessa = String(formData.get("promessa") ?? "").trim()
  const metaRaw = String(formData.get("meta") ?? "").trim()

  /* Aceita "5.000,50" e "5000.50". O lojista digita como fala, e recusar por
     causa da vírgula é atrito que não protege ninguém. */
  let meta: number | null = null
  if (metaRaw) {
    const limpo = metaRaw.replace(/[^\d,.-]/g, "")
    const normal =
      limpo.includes(",") && limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
        ? limpo.replace(/\./g, "").replace(",", ".")
        : limpo.replace(/,/g, "")
    const n = Number(normal)
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `Meta inválida: "${metaRaw}".` }
    }
    meta = n
  }

  const { error } = await createAdminClient()
    .from("units")
    .update({ promessa_comercial: promessa || null, meta_30_dias: meta })
    .eq("id", unitId)
  if (error) return { ok: false, error: error.message }

  if (codigo) revalidatePath(`/unidades/${codigo}`)
  return { ok: true, message: "Salvo." }
}
