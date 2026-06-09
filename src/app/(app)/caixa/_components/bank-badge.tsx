import { Landmark } from "lucide-react"

/** Marca de cada banco: cor de fundo, cor do texto, wordmark curto e nome. */
export const BANKS: Record<string, { bg: string; fg: string; label: string; name: string }> = {
  itau: { bg: "#EC7000", fg: "#fff", label: "itaú", name: "Itaú" },
  itau_personnalite: { bg: "#0A0A0A", fg: "#fff", label: "itaú", name: "Itaú Personnalité" },
  bradesco: { bg: "#CC092F", fg: "#fff", label: "brad", name: "Bradesco" },
  santander: { bg: "#EC0000", fg: "#fff", label: "San", name: "Santander" },
  bb: { bg: "#0033A0", fg: "#FFE000", label: "BB", name: "Banco do Brasil" },
  caixa: { bg: "#0070AF", fg: "#fff", label: "CX", name: "Caixa" },
  nubank: { bg: "#820AD1", fg: "#fff", label: "nu", name: "Nubank" },
  inter: { bg: "#FF7A00", fg: "#fff", label: "inter", name: "Inter" },
  c6: { bg: "#121212", fg: "#fff", label: "C6", name: "C6 Bank" },
  safra: { bg: "#0A2240", fg: "#fff", label: "Safra", name: "Safra" },
  btg: { bg: "#001E62", fg: "#fff", label: "btg", name: "BTG" },
  asaas: { bg: "#0052FF", fg: "#fff", label: "asaas", name: "Asaas" },
  sicoob: { bg: "#00AE9D", fg: "#fff", label: "Sic", name: "Sicoob" },
}

export const BANK_SLUGS = Object.keys(BANKS)

/** Logos reais (arquivos em /public/banks). Slug → caminho do arquivo. */
export const BANK_LOGOS: Record<string, string> = {
  itau: "/banks/itau.png",
  itau_personnalite: "/banks/itau-personnalite.png",
  bradesco: "/banks/bradesco.png",
  santander: "/banks/santander.png",
  bb: "/banks/banco-do-brasil.png",
  caixa: "/banks/caixa.png",
  nubank: "/banks/nubank.png",
  inter: "/banks/inter.png",
  c6: "/banks/c6-bank.png",
  safra: "/banks/safra.png",
  btg: "/banks/btg.png",
  asaas: "/banks/asaas.png",
}

/** Selo do banco: logo real (arquivo/upload) quando há, senão marca por cor. */
export function BankBadge({
  bank,
  logoUrl,
  size = 40,
  className = "",
}: {
  bank?: string | null
  logoUrl?: string | null
  size?: number
  className?: string
}) {
  const style = { width: size, height: size } as const
  const src = logoUrl || (bank ? BANK_LOGOS[bank] : null)
  if (src) {
    return (
      <span
        style={style}
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-contain p-[14%]" />
      </span>
    )
  }
  const m = bank ? BANKS[bank] : null
  if (!m) {
    return (
      <span
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ${className}`}
      >
        <Landmark className="size-1/2" />
      </span>
    )
  }
  const fontSize = m.label.length <= 2 ? size * 0.42 : m.label.length <= 4 ? size * 0.3 : size * 0.24
  return (
    <span
      style={{ ...style, backgroundColor: m.bg, color: m.fg, fontSize }}
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold leading-none tracking-tight ${className}`}
    >
      {m.label}
    </span>
  )
}
