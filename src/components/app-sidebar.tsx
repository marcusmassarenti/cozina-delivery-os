"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Cable,
  Flame,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Wallet,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string | number
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Alertas", href: "/alertas", icon: Bell, badge: 1 },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Unidades", href: "/unidades", icon: Store },
      { label: "Plataformas", href: "/plataformas", icon: ShoppingBag },
      { label: "Produtos", href: "/produtos", icon: Package },
      { label: "Avaliações", href: "/avaliacoes", icon: Star },
    ],
  },
  {
    label: "Financeiro",
    items: [{ label: "Resultado", href: "/financeiro", icon: Wallet }],
  },
  {
    label: "Integrações",
    items: [{ label: "Conexões", href: "/conexoes", icon: Cable }],
  },
  {
    items: [
      { label: "Configurações", href: "/configuracoes", icon: Settings },
    ],
  },
]

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" className="dark">
      <SidebarHeader className="gap-1.5 px-3 py-3">
        <div className="group-data-[collapsible=icon]:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cozina-logo.png"
            alt="Cozina"
            className="h-9 w-auto"
          />
        </div>
        <Flame
          className="hidden size-5 text-[#ff4d1c] group-data-[collapsible=icon]:block"
          aria-hidden
        />
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground group-data-[collapsible=icon]:hidden">
          Delivery OS
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, idx) => (
          <SidebarGroup key={group.label ?? `group-${idx}`}>
            {group.label ? (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
                            {item.badge}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
          v0.1 · em construção
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
