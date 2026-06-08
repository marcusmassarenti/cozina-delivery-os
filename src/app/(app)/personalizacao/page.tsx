import { notFound } from "next/navigation"
import { Palette } from "lucide-react"

import { userCan } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"

import { LogoUploader } from "./_components/logo-uploader"

/**
 * Personalização (white-label) — o admin da empresa sobe o próprio logo,
 * que substitui o da Cozina no menu. Admin-only (gate por módulo usuários).
 */
export default async function PersonalizacaoPage() {
  if (!(await userCan("usuarios", "view"))) notFound()
  const ctx = await getCurrentUserContext()

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

      <LogoUploader currentLogo={ctx.logoUrl} />
    </div>
  )
}
