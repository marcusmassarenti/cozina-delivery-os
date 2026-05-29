import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getCurrentUserContext } from "@/lib/auth/context"
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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar
            userName={userContext.fullName}
            userInitials={userContext.initials}
            brandName={userContext.brandName}
          />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
