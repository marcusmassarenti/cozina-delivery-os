import {
  Cable,
  CalendarRange,
  ClipboardList,
  FileUp,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Receipt,
  Settings,
  Star,
  Store,
  Users,
  Wallet,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
  /** Marca como "em breve": item visível mas desabilitado (não navega). */
  comingSoon?: boolean
}

export type NavGroup = {
  label?: string
  defaultOpen?: boolean
  items: NavItem[]
}

/** Estrutura do menu lateral — fonte única (sidebar + busca + favoritos). */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Operação",
    defaultOpen: true,
    items: [
      { label: "Unidades", href: "/unidades", icon: Store },
      { label: "Produtos", href: "/produtos", icon: Package, comingSoon: true },
      { label: "Pedidos", href: "/pedidos", icon: Receipt },
      { label: "Avaliações", href: "/avaliacoes", icon: Star },
    ],
  },
  {
    label: "Financeiro",
    defaultOpen: true,
    items: [
      {
        label: "Hub de Relatórios",
        href: "/relatorios",
        icon: ClipboardList,
      },
      {
        label: "Relatório Diário",
        href: "/relatorio-diario",
        icon: CalendarRange,
      },
      { label: "DRE Grupo", href: "/financeiro", icon: Wallet },
    ],
  },
  {
    label: "Integrações",
    defaultOpen: true,
    items: [
      { label: "Importação", href: "/importacao", icon: FileUp },
      { label: "Conexões", href: "/conexoes", icon: Cable },
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

export type FlatNavItem = {
  label: string
  href: string
  icon: LucideIcon
  group?: string
}

/** Lista achatada dos itens navegáveis (pra busca e favoritos). */
export const NAV_ITEMS: FlatNavItem[] = NAV_GROUPS.flatMap((g) =>
  g.items
    .filter((i) => !i.comingSoon)
    .map((i) => ({
      label: i.label,
      href: i.href,
      icon: i.icon,
      group: g.label,
    })),
)
