"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ClipboardList,
  CreditCard,
  FileText,
  Lock,
  Palette,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react"

const TABS: {
  href: string
  label: string
  icon: LucideIcon
  /** Só o super-admin da plataforma vê (ex.: perfis, que são globais). */
  soSuperadmin?: boolean
}[] = [
  { href: "/minha-conta/informacoes", label: "Informações", icon: FileText },
  {
    href: "/minha-conta/personalizacao",
    label: "Personalização",
    icon: Palette,
  },
  { href: "/minha-conta/relatorios", label: "Relatórios", icon: ClipboardList },
  { href: "/minha-conta/assinatura", label: "Assinatura", icon: CreditCard },
  { href: "/minha-conta/seguranca", label: "Segurança", icon: Lock },
  // Perfis valem pra todos os clientes — editar é coisa do dono da plataforma.
  {
    href: "/minha-conta/permissoes",
    label: "Permissões",
    icon: ShieldCheck,
    soSuperadmin: true,
  },
  { href: "/minha-conta/usuarios", label: "Usuários", icon: Users },
]

export function ContaTabs({ superadmin = false }: { superadmin?: boolean }) {
  const path = usePathname()
  return (
    <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto">
      {TABS.filter((t) => !t.soSuperadmin || superadmin).map((t) => {
        const active = path.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
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
