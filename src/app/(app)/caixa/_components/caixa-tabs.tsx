"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/caixa", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/caixa/lancamentos", label: "Lançamentos", icon: ListOrdered },
  { href: "/caixa/contas", label: "Contas", icon: Wallet },
  { href: "/caixa/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/caixa/categorias", label: "Categorias", icon: Tag },
  { href: "/caixa/cadastros", label: "Cadastros", icon: Users },
]

export function CaixaTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
