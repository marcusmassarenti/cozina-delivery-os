import {
  Building2,
  Cable,
  CalendarRange,
  ClipboardList,
  Coins,
  CreditCard,
  Factory,
  FileUp,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Receipt,
  Sparkles,
  Star,
  Scale,
  Store,
  Tag,
  TrendingUp,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
  /** Marca como "em breve": item visível mas desabilitado (não navega). */
  comingSoon?: boolean
  /** Destaque permanente no menu (cor de marca sempre) — caso do Nino AI. */
  highlight?: boolean
  /** Módulo de permissão (RBAC). Sem módulo = sempre visível. */
  module?: string
  /** Só aparece pro super-admin da plataforma (dono do SaaS). */
  superadminOnly?: boolean
  /** Módulo do plano Pro — só aparece pra quem tem o plano Pro (ou super-admin). */
  proOnly?: boolean
  /** Ativo só no path exato (ex.: /caixa não fica ativo em /caixa/lancamentos). */
  exact?: boolean
}

export type NavGroup = {
  label?: string
  defaultOpen?: boolean
  items: NavItem[]
}

/** Estrutura do menu lateral — fonte única (sidebar + busca + favoritos). */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        module: "dashboard",
      },
      // Sem module: aparece pra TODOS os planos. Quem não tem o plano AI cai no
      // upsell da página (vira vitrine que puxa upgrade). Destaque permanente.
      {
        label: "Nino AI",
        href: "/consultor-ia",
        icon: Sparkles,
        highlight: true,
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
    label: "Gestão",
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
    // Módulo Pro (Fluxo de Caixa): as abas viram itens do menu. Todos proOnly,
    // então o grupo inteiro some pra quem está no Essencial.
    label: "Financeiro",
    defaultOpen: true,
    items: [
      {
        label: "Visão Geral",
        href: "/caixa",
        icon: Coins,
        module: "financeiro",
        proOnly: true,
        exact: true,
      },
      {
        label: "Fluxo de Caixa",
        href: "/caixa/fluxo",
        icon: TrendingUp,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Lançamentos",
        href: "/caixa/lancamentos",
        icon: ListOrdered,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "A pagar & receber",
        href: "/caixa/aging",
        icon: Scale,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Contas",
        href: "/caixa/contas",
        icon: Wallet,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Cartões",
        href: "/caixa/cartoes",
        icon: CreditCard,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Categorias",
        href: "/caixa/categorias",
        icon: Tag,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Cadastros",
        href: "/caixa/cadastros",
        icon: Users,
        module: "financeiro",
        proOnly: true,
      },
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
      {
        label: "Conexões",
        href: "/conexoes",
        icon: Cable,
        module: "conexoes",
        superadminOnly: true,
      },
      {
        label: "Cardápio Web",
        href: "/integracao/cardapioweb",
        icon: UtensilsCrossed,
        module: "conexoes",
        superadminOnly: true,
      },
      {
        label: "Ficha Técnica ERP",
        href: "/ficha-tecnica",
        icon: Factory,
        module: "conexoes",
        superadminOnly: true,
      },
    ],
  },
  {
    label: "Administração",
    defaultOpen: true,
    items: [
      {
        label: "Clientes",
        href: "/plataforma",
        icon: Building2,
        superadminOnly: true,
      },
      {
        label: "Minha conta",
        href: "/minha-conta/informacoes",
        icon: UserCog,
        module: "usuarios",
      },
      { label: "Novidades", href: "/novidades", icon: Sparkles },
    ],
  },
]

export type FlatNavItem = {
  label: string
  href: string
  icon: LucideIcon
  group?: string
  module?: string
  proOnly?: boolean
  exact?: boolean
  highlight?: boolean
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
      proOnly: i.proOnly,
      exact: i.exact,
      highlight: i.highlight,
    })),
)
