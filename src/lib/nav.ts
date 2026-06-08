import {
  Building2,
  Cable,
  CalendarRange,
  ClipboardList,
  Factory,
  FileUp,
  LayoutDashboard,
  type LucideIcon,
  Palette,
  Receipt,
  ShieldCheck,
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
  /** Módulo de permissão (RBAC). Sem módulo = sempre visível. */
  module?: string
  /** Só aparece pro super-admin da plataforma (dono do SaaS). */
  superadminOnly?: boolean
}

export type NavGroup = {
  label?: string
  defaultOpen?: boolean
  items: NavItem[]
}

/** Estrutura do menu lateral — fonte única (sidebar + busca + favoritos). */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Plataforma",
    defaultOpen: true,
    items: [
      {
        label: "Clientes",
        href: "/plataforma",
        icon: Building2,
        superadminOnly: true,
      },
    ],
  },
  {
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        module: "dashboard",
      },
    ],
  },
  {
    label: "Operação",
    defaultOpen: true,
    items: [
      { label: "Unidades", href: "/unidades", icon: Store, module: "unidades" },
      { label: "Pedidos", href: "/pedidos", icon: Receipt, module: "pedidos" },
      {
        label: "Avaliações",
        href: "/avaliacoes",
        icon: Star,
        module: "avaliacoes",
      },
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
        module: "relatorios",
      },
      {
        label: "Relatório Diário",
        href: "/relatorio-diario",
        icon: CalendarRange,
        module: "relatorios",
      },
      { label: "DRE Grupo", href: "/financeiro", icon: Wallet, module: "financeiro" },
    ],
  },
  {
    label: "Integrações",
    defaultOpen: true,
    items: [
      {
        label: "Importação",
        href: "/importacao",
        icon: FileUp,
        module: "importacao",
      },
      { label: "Conexões", href: "/conexoes", icon: Cable, module: "conexoes" },
      {
        label: "Ficha Técnica ERP",
        href: "/ficha-tecnica",
        icon: Factory,
        module: "conexoes",
      },
    ],
  },
  {
    label: "Administração",
    defaultOpen: true,
    items: [
      {
        label: "Usuários",
        href: "/administracao/usuarios",
        icon: Users,
        module: "usuarios",
      },
      {
        label: "Permissões",
        href: "/administracao/permissoes",
        icon: ShieldCheck,
        module: "usuarios",
      },
      {
        label: "Personalização",
        href: "/personalizacao",
        icon: Palette,
        module: "usuarios",
      },
    ],
  },
]

export type FlatNavItem = {
  label: string
  href: string
  icon: LucideIcon
  group?: string
  module?: string
}

/** Lista achatada dos itens navegáveis (pra busca e favoritos). */
export const NAV_ITEMS: FlatNavItem[] = NAV_GROUPS.flatMap((g) =>
  g.items
    .filter((i) => !i.comingSoon && !i.superadminOnly)
    .map((i) => ({
      label: i.label,
      href: i.href,
      icon: i.icon,
      group: g.label,
      module: i.module,
    })),
)
