"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Cable,
  ChevronDown,
  FileUp,
  Flame,
  LayoutDashboard,
  Package,
  Settings,
  Star,
  Store,
  Users,
  Wallet,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string | number
  /** Marca como "em breve": item visível mas desabilitado (não navega). */
  comingSoon?: boolean
}

type NavGroup = {
  label?: string
  defaultOpen?: boolean
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Operação",
    defaultOpen: true,
    items: [
      { label: "Unidades", href: "/unidades", icon: Store },
      { label: "Produtos", href: "/produtos", icon: Package, comingSoon: true },
      { label: "Avaliações", href: "/avaliacoes", icon: Star, comingSoon: true },
    ],
  },
  {
    label: "Financeiro",
    defaultOpen: true,
    items: [
      { label: "Resultado", href: "/financeiro", icon: Wallet, comingSoon: true },
    ],
  },
  {
    label: "Integrações",
    defaultOpen: true,
    items: [
      { label: "Importação", href: "/importacao", icon: FileUp },
      { label: "Conexões", href: "/conexoes", icon: Cable, comingSoon: true },
    ],
  },
  {
    label: "Administração",
    defaultOpen: true,
    items: [
      { label: "Usuários", href: "/administracao/usuarios", icon: Users },
    ],
  },
  {
    items: [
      {
        label: "Configurações",
        href: "/configuracoes",
        icon: Settings,
        comingSoon: true,
      },
    ],
  },
]

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

function MenuItems({
  items,
  pathname,
}: {
  items: NavItem[]
  pathname: string
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isItemActive(pathname, item.href)
        // Itens "em breve": botão estático, sem Link, com badge cinza
        if (item.comingSoon) {
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                tooltip={`${item.label} (em breve)`}
                className="cursor-not-allowed opacity-50 hover:bg-transparent"
                aria-disabled
              >
                <item.icon />
                <span>{item.label}</span>
                <span className="ml-auto rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
                  em breve
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        }
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
  )
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
          Gestão de Delivery
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, idx) => {
          if (!group.label) {
            return (
              <SidebarGroup key={`group-${idx}`}>
                <SidebarGroupContent>
                  <MenuItems items={group.items} pathname={pathname} />
                </SidebarGroupContent>
              </SidebarGroup>
            )
          }
          return (
            <Collapsible
              key={group.label}
              defaultOpen={group.defaultOpen}
              className="group/collapsible"
            >
              <SidebarGroup>
                <CollapsibleTrigger
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/80 outline-hidden transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
                >
                  <ChevronDown className="size-3.5 shrink-0 transition-transform duration-200 group-data-[closed]/collapsible:-rotate-90" />
                  <span>{group.label}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent className="mt-1">
                    <MenuItems items={group.items} pathname={pathname} />
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
          V2.2026
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
