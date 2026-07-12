"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireAdmin, requireSuperadmin } from "@/lib/auth/guards"
import {
  getAccessibleUnitIds,
  getCurrentHoldingId,
} from "@/lib/auth/permissions"
import { validateImageUpload } from "@/lib/upload/image"

export type BrandingState = { ok: boolean; message?: string }

/** Salva o nome da empresa (holdings.name) — aparece no menu, relatórios e boas-vindas. */
export async function saveCompanyName(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  try {
    const { admin } = await requireAdmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { ok: false, message: "Digite o nome da empresa." }
    if (name.length > 60) return { ok: false, message: "Nome muito longo (máx. 60)." }
    const { error } = await admin
      .from("holdings")
      .update({ name })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/", "layout")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Sobe o logo da empresa do admin logado e grava a URL em holdings.logo_url. */
export async function uploadLogo(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  try {
    const { admin } = await requireAdmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }

    const img = await validateImageUpload(formData.get("logo"))
    if (!img.ok) return { ok: false, message: img.message }

    const path = `${holdingId}/logo.${img.ext}`
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, img.bytes, { upsert: true, contentType: img.contentType })
    if (upErr) return { ok: false, message: `Falha no upload: ${upErr.message}` }

    const { data: pub } = admin.storage.from("branding").getPublicUrl(path)
    // cache-bust: troca a URL a cada upload pra o CDN não servir a antiga
    const url = `${pub.publicUrl}?v=${Date.now()}`

    const { error: updErr } = await admin
      .from("holdings")
      .update({ logo_url: url })
      .eq("id", holdingId)
    if (updErr) return { ok: false, message: updErr.message }

    revalidatePath("/", "layout")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/**
 * Sobe UM logo e aplica como avatar de TODAS as lojas da empresa
 * (units.logo_url). Pra rede de marca única (ex.: Churrasco no Pote no Cozina),
 * deixa todas as lojas com o mesmo logo de uma vez.
 */
export async function applyStoreLogoToAll(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  try {
    const { admin } = await requireAdmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }

    const img = await validateImageUpload(formData.get("logo"))
    if (!img.ok) return { ok: false, message: img.message }

    // Só as lojas do próprio escopo (anti cross-tenant). Fail-closed: nunca
    // atualiza "todas as lojas do banco".
    const unitIds = await getAccessibleUnitIds()
    if (!unitIds || unitIds.length === 0)
      return { ok: false, message: "Nenhuma loja no seu escopo." }

    const path = `${holdingId}/store-logo.${img.ext}`
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, img.bytes, { upsert: true, contentType: img.contentType })
    if (upErr) return { ok: false, message: `Falha no upload: ${upErr.message}` }
    const { data: pub } = admin.storage.from("branding").getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}`

    const { error: updErr } = await admin
      .from("units")
      .update({ logo_url: url })
      .in("id", unitIds)
    if (updErr)
      return {
        ok: false,
        message: `Não consegui aplicar. A coluna logo_url existe? (rode a migration 0062). Detalhe: ${updErr.message}`,
      }

    revalidateTag("units", "max")
    revalidatePath("/", "layout")
    revalidatePath("/unidades")
    revalidatePath("/personalizacao")
    return { ok: true, message: `Logo aplicado em ${unitIds.length} loja(s).` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Remove o logo de TODAS as lojas do escopo (volta pro logo da empresa / inicial). */
export async function clearStoreLogoFromAll(): Promise<BrandingState> {
  try {
    const { admin } = await requireAdmin()
    const unitIds = await getAccessibleUnitIds()
    if (!unitIds || unitIds.length === 0)
      return { ok: false, message: "Nenhuma loja no seu escopo." }
    const { error } = await admin
      .from("units")
      .update({ logo_url: null })
      .in("id", unitIds)
    if (error) return { ok: false, message: error.message }
    revalidateTag("units", "max")
    revalidatePath("/", "layout")
    revalidatePath("/unidades")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Remove o logo da empresa (volta pro padrão). */
export async function removeLogo(): Promise<BrandingState> {
  try {
    const { admin } = await requireAdmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }

    await admin.from("holdings").update({ logo_url: null }).eq("id", holdingId)
    revalidatePath("/", "layout")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/**
 * Sobe a imagem da TELA DE LOGIN (hero). Só super-admin (a tela de login é a
 * porta da plataforma). Aceita imagem maior (é um fundo): até 5 MB.
 */
export async function uploadLoginImage(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  try {
    const { admin } = await requireSuperadmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }

    const img = await validateImageUpload(formData.get("loginImage"), 5 * 1024 * 1024)
    if (!img.ok) return { ok: false, message: img.message }

    const path = `${holdingId}/login.${img.ext}`
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, img.bytes, { upsert: true, contentType: img.contentType })
    if (upErr) return { ok: false, message: `Falha no upload: ${upErr.message}` }

    const { data: pub } = admin.storage.from("branding").getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}`
    const { error: updErr } = await admin
      .from("holdings")
      .update({ login_image_url: url })
      .eq("id", holdingId)
    if (updErr) return { ok: false, message: updErr.message }

    revalidatePath("/login")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

/** Remove a imagem da tela de login (volta pro hero genérico). */
export async function removeLoginImage(): Promise<BrandingState> {
  try {
    const { admin } = await requireSuperadmin()
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return { ok: false, message: "Empresa não identificada." }

    await admin
      .from("holdings")
      .update({ login_image_url: null })
      .eq("id", holdingId)
    revalidatePath("/login")
    revalidatePath("/personalizacao")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}
