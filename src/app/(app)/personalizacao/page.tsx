import { notFound } from "next/navigation"
import { Palette } from "lucide-react"

import { isSuperadmin, userCan, getCurrentHoldingId } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"
import { createAdminClient } from "@/lib/supabase/admin"

import { CompanyNameForm } from "./_components/company-name-form"
import { LogoUploader } from "./_components/logo-uploader"
import { StoreLogoUploader } from "./_components/store-logo-uploader"
import { LoginImageUploader } from "./_components/login-image-uploader"

/**
 * Personalização (white-label) — o admin sobe o logo do menu (por empresa).
 * O super-admin (dono da plataforma) também controla a imagem da tela de login.
 */
export default async function PersonalizacaoPage() {
  if (!(await userCan("usuarios", "view"))) notFound()
  const [ctx, superadmin] = await Promise.all([
    getCurrentUserContext(),
    isSuperadmin(),
  ])

  // Imagem atual da tela de login (só relevante pro super-admin).
  let loginImage: string | null = null
  if (superadmin) {
    const holdingId = await getCurrentHoldingId()
    if (holdingId) {
      const admin = createAdminClient()
      const { data } = await admin
        .from("holdings")
        .select("login_image_url")
        .eq("id", holdingId)
        .maybeSingle()
      loginImage = (data?.login_image_url as string | null) ?? null
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Palette className="size-6 text-muted-foreground" />
          Personalização
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Deixe o sistema com a cara da sua empresa.
        </p>
      </div>

      <CompanyNameForm current={ctx.companyName} />

      <LogoUploader currentLogo={ctx.logoUrl} />

      <StoreLogoUploader />

      {superadmin && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plataforma (só você)
          </p>
          <LoginImageUploader currentImage={loginImage} />
        </div>
      )}
    </div>
  )
}
