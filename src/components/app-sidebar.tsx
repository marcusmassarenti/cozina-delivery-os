"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Star } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { SuporteItemMenu } from "@/components/suporte/suporte-item-menu"
import { useFavorites } from "@/hooks/use-favorites"
import { useGruposMenu } from "@/hooks/use-grupos-menu"
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/nav"
import { OPEN_HELP_EVENT } from "@/app/(app)/ajuda/_components/help-dialog"

function isItemActive(pathname: string, href: string, exact?: boolean) {
  if (href === "/" || exact) return pathname === href
  return pathname === href || pathname.startsWith(href + "/")
}

function MenuItems({
  items,
  pathname,
  isFav,
  onToggleFav,
}: {
  items: NavItem[]
  pathname: string
  isFav: (href: string) => boolean
  onToggleFav: (href: string) => void
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isItemActive(pathname, item.href, item.exact)
        // Itens "em breve": botão estático, sem Link nem estrela.
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
        // "Ajuda" abre a central como MODAL (na mesma tela), não navega.
        if (item.href === "/ajuda") {
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                tooltip={item.label}
                onClick={() =>
                  window.dispatchEvent(new Event(OPEN_HELP_EVENT))
                }
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        }
        const fav = isFav(item.href)
        return (
          <SidebarMenuItem key={item.href} className="relative">
            <SidebarMenuButton
              render={<Link href={item.href} />}
              isActive={active}
              tooltip={item.label}
              className={
                item.highlight
                  ? `font-medium text-primary [&>svg]:text-primary hover:text-primary ${
                      active ? "" : "bg-primary/10 hover:bg-primary/15"
                    }`
                  : undefined
              }
            >
              <item.icon />
              <span>{item.label}</span>
              {item.highlight && (
                <span className="ml-auto mr-4 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary group-data-[collapsible=icon]:hidden">
                  IA
                </span>
              )}
            </SidebarMenuButton>
            {/* Estrela de favorito (só na sidebar expandida) */}
            <button
              type="button"
              aria-label={fav ? "Desfavoritar" : "Favoritar"}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleFav(item.href)
              }}
              className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 transition-colors group-data-[collapsible=icon]:hidden"
            >
              <Star
                className={`size-3.5 transition-colors ${
                  fav
                    ? "fill-amber-400 text-amber-400"
                    : "text-sidebar-foreground/30 hover:text-sidebar-foreground/70"
                }`}
              />
            </button>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export function AppSidebar({
  allowedModules,
  isSuperadmin = false,
  isPro = false,
  logoUrl = null,
  companyName = "",
  podeVerSuporte = false,
}: {
  allowedModules: string[]
  isSuperadmin?: boolean
  isPro?: boolean
  logoUrl?: string | null
  companyName?: string
  /** Mesmo portão do painel de suporte — botão sem painel não abre nada. */
  podeVerSuporte?: boolean
}) {
  const pathname = usePathname()
  const { isFav, toggle, ready } = useFavorites()
  const { estaAberto, alternar } = useGruposMenu()
  const { toggleSidebar, state } = useSidebar()

  const allowed = new Set(allowedModules)
  // Item visível se: passa no gate de super-admin (quando exigido), no gate do
  // plano Pro (quando exigido) E (é "em breve", não tem módulo, ou o perfil pode
  // "Ver" aquele módulo).
  const canSee = (item: {
    module?: string
    comingSoon?: boolean
    superadminOnly?: boolean
    proOnly?: boolean
  }) =>
    (!item.superadminOnly || isSuperadmin) &&
    (!item.proOnly || isPro) &&
    (!!item.comingSoon || !item.module || allowed.has(item.module))

  const favItems = NAV_ITEMS.filter((i) => isFav(i.href) && canSee(i))

  return (
    <Sidebar collapsible="icon" className="dark">
      <SidebarHeader className="gap-1.5 px-3 py-3">
        {logoUrl ? (
          <>
            {/* Logo da empresa + nome + selo "Delivery OS" — expandido */}
            <div className="group-data-[collapsible=icon]:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo"
                className="h-9 w-auto max-w-[170px] object-contain"
              />
              {companyName && (
                <p className="mt-1.5 truncate text-xs font-medium text-sidebar-foreground/90">
                  {companyName}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5 border-t border-white/[0.08] pt-1.5">
                <DeliveryOsMark className="size-4 rounded-[5px]" />
                <span className="text-[10px] font-medium tracking-tight text-sidebar-foreground/60">
                  Delivery OS
                </span>
              </div>
            </div>
            {/* Colapsado: logo num quadrado */}
            <span className="hidden size-8 items-center justify-center overflow-hidden rounded-lg group-data-[collapsible=icon]:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="size-full object-contain" />
            </span>
          </>
        ) : (
          <>
            {/* Sem logo: nome da empresa em destaque (ou Delivery OS) + selo */}
            <div className="group-data-[collapsible=icon]:hidden">
              <p className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
                {companyName || "Delivery OS"}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <DeliveryOsMark className="size-4 rounded-[5px]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/55">
                  {companyName ? "Delivery OS" : "Gestão de Delivery"}
                </span>
              </div>
            </div>
            <DeliveryOsMark className="hidden size-8 group-data-[collapsible=icon]:flex" />
          </>
        )}
      </SidebarHeader>
      <SidebarContent>
        {/* Favoritos (só aparece depois de montar, com itens favoritados) */}
        {ready && favItems.length > 0 && (
          <SidebarGroup>
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span>Favoritos</span>
            </div>
            <SidebarGroupContent>
              <MenuItems
                items={favItems.map((i) => ({
                  label: i.label,
                  href: i.href,
                  icon: i.icon,
                  exact: i.exact,
                  highlight: i.highlight,
                }))}
                pathname={pathname}
                isFav={isFav}
                onToggleFav={toggle}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {NAV_GROUPS.map((group, idx) => {
          const items = group.items.filter(canSee)
          if (items.length === 0) return null
          if (!group.label) {
            return (
              <SidebarGroup key={`group-${idx}`}>
                <SidebarGroupContent>
                  <MenuItems
                    items={items}
                    pathname={pathname}
                    isFav={isFav}
                    onToggleFav={toggle}
                  />
                </SidebarGroupContent>
              </SidebarGroup>
            )
          }
          return (
            <Collapsible
              key={group.label}
              // Controlado, não `defaultOpen`: é isso que faz a categoria
              // continuar fechada na próxima visita. Ver `useGruposMenu`.
              open={estaAberto(group.label ?? "", group.defaultOpen ?? true)}
              onOpenChange={(aberto) => alternar(group.label ?? "", aberto)}
              className="group/collapsible"
            >
              <SidebarGroup>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/80 outline-hidden transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden">
                  <ChevronDown className="size-3.5 shrink-0 transition-transform duration-200 group-data-[closed]/collapsible:-rotate-90" />
                  <span>{group.label}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent className="mt-1">
                    <MenuItems
                      items={items}
                      pathname={pathname}
                      isFav={isFav}
                      onToggleFav={toggle}
                    />
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {/* Ajuda antes de "Recolher menu": é a saída que alguém procura
              quando emperrou, e recolher o menu é ajuste de layout. */}
          {podeVerSuporte && <SuporteItemMenu />}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={state === "expanded" ? "Recolher menu" : "Expandir menu"}
            >
              {state === "expanded" ? (
                <PanelLeftClose />
              ) : (
                <PanelLeftOpen />
              )}
              <span>Recolher menu</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
          V2.2026
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
