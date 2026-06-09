import {
  Bike,
  Coins,
  Droplet,
  Home,
  Landmark,
  Megaphone,
  MoreHorizontal,
  Plus,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

/** Ícones permitidos pra categorias (nome → componente lucide). */
export const FIN_ICONS: Record<string, LucideIcon> = {
  Home,
  Landmark,
  Truck,
  Users,
  Zap,
  Droplet,
  Wifi,
  Megaphone,
  Bike,
  Wrench,
  MoreHorizontal,
  Store,
  Plus,
  Coins,
  ShoppingCart,
  Utensils,
  Tag,
}

export const FIN_ICON_NAMES = Object.keys(FIN_ICONS)

export function FinIcon({
  name,
  className,
}: {
  name: string | null
  className?: string
}) {
  const Icon = (name && FIN_ICONS[name]) || Tag
  return <Icon className={className} />
}

/** Cor do banco pelo slug (pra bolinha do ícone da conta). */
export function bankColor(bank: string | null): string {
  const map: Record<string, string> = {
    itau: "bg-orange-500",
    inter: "bg-orange-600",
    btg: "bg-slate-800",
    santander: "bg-red-600",
    bradesco: "bg-red-500",
    nubank: "bg-purple-600",
    caixa: "bg-blue-700",
    bb: "bg-yellow-500",
    asaas: "bg-sky-500",
    sicoob: "bg-teal-600",
    safra: "bg-blue-900",
  }
  return (bank && map[bank]) || "bg-muted-foreground"
}
