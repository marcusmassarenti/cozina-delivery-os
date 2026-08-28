import {
  Share2,
  Activity,
  FileSignature,
  Headset,
  Building2,
  Cable,
  CalendarRange,
  ClipboardList,
  Coins,
  CreditCard,
  ChefHat,
  FileText,
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
  UsersRound,
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
        href: "/inicio",
        icon: LayoutDashboard,
        module: "dashboard",
      },
      // Sem module: aparece pra TODOS os planos. Quem não tem o plano AI cai no
      // upsell da página (vira vitrine que puxa upgrade). Destaque permanente.
      {
        label: "Nino AI",
        href: "/nino",
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
      { label: "DRE Grupo", href: "/dre", icon: Wallet, module: "financeiro" },
    ],
  },
  {
    /* CARTEIRA — as telas de quem administra uma agência de delivery.
     *
     * Seção própria, e o nome NÃO é "Gestor": gestor é uma das entidades de
     * dentro, e batizar a seção com o nome de uma tela dela confunde (seria
     * como chamar o Financeiro de "Lançamentos"). Quem usa isto é o DONO da
     * agência; o gestor é quem é medido.
     *
     * Fica no módulo `unidades` porque é sobre a carteira de lojas — e some
     * pra cliente de loja única, que não tem carteira pra administrar. */
    label: "Carteira",
    defaultOpen: true,
    items: [
      {
        label: "Gestores",
        href: "/carteira/gestores",
        icon: UsersRound,
        module: "unidades",
      },
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
        href: "/financeiro",
        icon: Coins,
        module: "financeiro",
        proOnly: true,
        exact: true,
      },
      {
        label: "Fluxo de Caixa",
        href: "/financeiro/fluxo",
        icon: TrendingUp,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Lançamentos",
        href: "/financeiro/lancamentos",
        icon: ListOrdered,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Notas & insumos",
        href: "/financeiro/notas",
        icon: FileText,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Ficha técnica",
        href: "/ficha-tecnica",
        icon: ChefHat,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "A pagar & receber",
        href: "/financeiro/a-pagar-receber",
        icon: Scale,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Contas",
        href: "/financeiro/contas",
        icon: Wallet,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Cartões",
        href: "/financeiro/cartoes",
        icon: CreditCard,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Categorias",
        href: "/financeiro/categorias",
        icon: Tag,
        module: "financeiro",
        proOnly: true,
      },
      {
        label: "Cadastros",
        href: "/financeiro/cadastros",
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
      // Cardápio Web saiu do menu: agora se chega nele PELO card da
      // plataforma em Conexões, junto com iFood, 99 e Keeta. Conexão de
      // plataforma morava em três endereços diferentes e cada um respondia um
      // pedaço da mesma pergunta — a porta passa a ser uma só.
    ],
  },
  {
    label: "Administração",
    defaultOpen: true,
    items: [
      {
        label: "Clientes",
        href: "/clientes",
        icon: Building2,
        superadminOnly: true,
      },
      {
        label: "Suporte",
        href: "/suporte",
        icon: Headset,
        superadminOnly: true,
      },
      {
        label: "Propostas",
        href: "/propostas",
        icon: FileSignature,
        superadminOnly: true,
      },
      {
        label: "Saúde",
        href: "/saude",
        icon: Activity,
        superadminOnly: true,
      },
      {
        label: "Indicações",
        href: "/indicacoes",
        icon: Share2,
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
