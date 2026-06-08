import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { WelcomeTour } from "@/components/onboarding/welcome-tour"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getCurrentUserContext } from "@/lib/auth/context"
import { MODULES, userCan, isSuperadmin } from "@/lib/auth/permissions"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    redirect("/login")
  }

  const userContext = await getCurrentUserContext()

  // Módulos que o perfil do usuário pode "Ver" — alimenta o filtro do menu.
  const moduleChecks = await Promise.all(
    MODULES.map(async (m) => ({
      key: m.key,
      ok: await userCan(m.key, "view"),
    })),
  )
  const allowedModules = moduleChecks.filter((m) => m.ok).map((m) => m.key)
  const superadmin = await isSuperadmin()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          allowedModules={allowedModules}
          isSuperadmin={superadmin}
          logoUrl={userContext.logoUrl}
        />
        <SidebarInset>
          <TopBar
            userName={userContext.fullName}
            userInitials={userContext.initials}
          />
          {children}
        </SidebarInset>
        <WelcomeTour
          initialOnboarded={userContext.onboarded}
          brandName={userContext.brandName}
        />
      </SidebarProvider>
    </TooltipProvider>
  )
}
