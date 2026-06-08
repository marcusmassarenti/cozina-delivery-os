"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin, requireSuperadmin } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type BrandingState = { ok: boolean; message?: string }

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

function extFor(type: string): string {
  if (type === "image/svg+xml") return "svg"
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  return "jpg"
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

    const file = formData.get("logo")
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Selecione um arquivo de imagem." }
    if (!ALLOWED.includes(file.type))
      return { ok: false, message: "Formato inválido. Use PNG, JPG, WEBP ou SVG." }
    if (file.size > MAX_BYTES)
      return { ok: false, message: "Imagem muito grande (máximo 2 MB)." }

    const path = `${holdingId}/logo.${extFor(file.type)}`
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type })
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

    const file = formData.get("loginImage")
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Selecione uma imagem." }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return { ok: false, message: "Use PNG, JPG ou WEBP." }
    if (file.size > 5 * 1024 * 1024)
      return { ok: false, message: "Imagem muito grande (máximo 5 MB)." }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    const path = `${holdingId}/login.${ext}`
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type })
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
