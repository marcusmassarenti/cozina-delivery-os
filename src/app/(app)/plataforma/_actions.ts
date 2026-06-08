"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { guard, requireSuperadmin } from "@/lib/auth/guards"

export type CriarClienteState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (combining marks)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Provisiona um CLIENTE novo (super-admin only): cria empresa (holding) +
 * marca + 1ª loja + usuário admin vinculado. O admin do cliente entra com
 * is_superadmin=false (vê só a própria empresa). Sem migration — só inserts.
 *
 * Ordem: cria o usuário PRIMEIRO (falha mais comum = e-mail repetido). Se um
 * passo seguinte falhar, faz rollback best-effort (remove o que criou).
 */
export async function criarCliente(
  _prev: CriarClienteState,
  formData: FormData,
): Promise<CriarClienteState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()

    const empresa = String(formData.get("empresa") ?? "").trim()
    const adminNome = String(formData.get("adminNome") ?? "").trim()
    const adminEmail = String(formData.get("adminEmail") ?? "")
      .trim()
      .toLowerCase()
    const adminSenha = String(formData.get("adminSenha") ?? "")
    const lojaNome = String(formData.get("lojaNome") ?? "").trim()
    const lojaCidade = String(formData.get("lojaCidade") ?? "").trim()
    const lojaUf = String(formData.get("lojaUf") ?? "").trim().toUpperCase()
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const feeRaw = String(formData.get("monthlyFee") ?? "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
    const monthlyFee =
      feeRaw && !Number.isNaN(Number(feeRaw)) ? Number(feeRaw) : null
    const dueDate = dateOrNull(formData.get("dueDate"))

    const fieldErrors: Record<string, string> = {}
    if (!empresa) fieldErrors.empresa = "Nome da empresa obrigatório"
    if (!adminNome) fieldErrors.adminNome = "Nome do admin obrigatório"
    if (!adminEmail || !adminEmail.includes("@"))
      fieldErrors.adminEmail = "E-mail inválido"
    if (adminSenha.length < 6)
      fieldErrors.adminSenha = "Senha precisa de pelo menos 6 caracteres"
    if (!lojaNome) fieldErrors.lojaNome = "Nome da 1ª loja obrigatório"
    if (lojaUf && lojaUf.length !== 2) fieldErrors.lojaUf = "UF com 2 letras"
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
    }

    // slug único da holding (append -2, -3… se já existir)
    let slug = slugify(empresa) || "cliente"
    const { data: existing } = await admin
      .from("holdings")
      .select("slug")
      .like("slug", `${slug}%`)
    const taken = new Set((existing ?? []).map((h) => h.slug as string))
    if (taken.has(slug)) {
      let i = 2
      while (taken.has(`${slug}-${i}`)) i++
      slug = `${slug}-${i}`
    }

    // 1) usuário admin primeiro (falha comum: e-mail repetido)
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminSenha,
      email_confirm: true,
      user_metadata: { full_name: adminNome },
    })
    if (userErr || !created?.user) {
      return {
        ok: false,
        message: `Falha ao criar o usuário admin: ${
          userErr?.message ?? "erro desconhecido"
        }`,
      }
    }
    const newUserId = created.user.id

    let holdingId: string | null = null
    let brandId: string | null = null
    try {
      // 2) empresa (holding)
      const { data: holding, error: hErr } = await admin
        .from("holdings")
        .insert({
          name: empresa,
          slug,
          establishment_type: establishmentType,
          payment_method: paymentMethod,
          monthly_fee: monthlyFee,
          due_date: dueDate,
          paid: true,
        })
        .select("id")
        .single()
      if (hErr || !holding) throw new Error(hErr?.message ?? "Falha ao criar empresa")
      holdingId = holding.id

      // 3) marca (mesma identidade da empresa por ora)
      const { data: brand, error: bErr } = await admin
        .from("brands")
        .insert({
          holding_id: holding.id,
          name: empresa,
          slug: slugify(empresa) || "marca",
        })
        .select("id")
        .single()
      if (bErr || !brand) throw new Error(bErr?.message ?? "Falha ao criar marca")
      brandId = brand.id

      // 4) 1ª loja
      const { error: uErr } = await admin.from("units").insert({
        brand_id: brand.id,
        code: "01",
        name: lojaNome,
        city: lojaCidade || null,
        state: lojaUf || null,
        active: true,
      })
      if (uErr) throw new Error(`Falha ao criar a loja: ${uErr.message}`)

      // 5) profile do admin: perfil administrador, NÃO super-admin da plataforma
      const { error: pErr } = await admin.from("profiles").upsert(
        {
          user_id: newUserId,
          full_name: adminNome,
          perfil: "administrador",
          is_superadmin: false,
        },
        { onConflict: "user_id" },
      )
      if (pErr) throw new Error(`Falha no perfil: ${pErr.message}`)

      // 6) vínculo: admin da holding nova
      const { error: aErr } = await admin.from("user_unit_access").insert({
        user_id: newUserId,
        scope_type: "holding",
        scope_id: holding.id,
        role: "admin",
      })
      if (aErr) throw new Error(`Falha no vínculo de acesso: ${aErr.message}`)
    } catch (e) {
      // rollback best-effort (FK é restrict → apaga na ordem filho→pai)
      if (brandId) await admin.from("units").delete().eq("brand_id", brandId)
      if (brandId) await admin.from("brands").delete().eq("id", brandId)
      if (holdingId) await admin.from("holdings").delete().eq("id", holdingId)
      await admin.auth.admin.deleteUser(newUserId)
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Falha ao provisionar o cliente.",
      }
    }

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/plataforma")
    return { ok: true }
  })
}

export type BillingActionState = { ok: boolean; message?: string }

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** Salva os dados de cobrança de um cliente (super-admin). */
export async function setClientBilling(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }

    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { ok: false, message: "Nome da empresa é obrigatório." }
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const feeRaw = String(formData.get("monthlyFee") ?? "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
    const fee = feeRaw ? Number(feeRaw) : null
    const monthlyFee = fee != null && !Number.isNaN(fee) ? fee : null
    const dueDate = dateOrNull(formData.get("dueDate"))
    const suspendOn = dateOrNull(formData.get("suspendOn"))
    const paid = formData.get("paid") === "on"

    const { error } = await admin
      .from("holdings")
      .update({
        name,
        establishment_type: establishmentType,
        payment_method: paymentMethod,
        monthly_fee: monthlyFee,
        due_date: dueDate,
        paid,
        suspend_on: suspendOn,
      })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }

    revalidatePath("/plataforma")
    revalidatePath("/", "layout")
    return { ok: true }
  })
}
