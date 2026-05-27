/**
 * Helpers de formatação de números, valores monetários e percentuais — pt-BR.
 */

export const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n)

export const fmtBRLShort = (n: number) => {
  if (n === 0) return "—"
  if (n >= 1000)
    return `R$ ${(n / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}k`
  return fmtBRL(n)
}

export const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(n)

export const fmtPct = (n: number) => `${n.toFixed(1)}%`
