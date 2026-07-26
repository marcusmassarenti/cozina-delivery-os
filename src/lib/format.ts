/**
 * Helpers de formatação de números, valores monetários e percentuais — pt-BR.
 */

export const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n)

/**
 * Valor curto para gráficos e cards estreitos.
 *
 * Escala de verdade: antes dividia SEMPRE por mil, então R$ 5.709.551 saía
 * como "R$ 5.709,6k" — quem não lida com número o dia todo não lê isso como
 * cinco milhões e setecentos. Agora vira "R$ 5,7 mi".
 *
 * "mil"/"mi" em vez de "k"/"M": é relatório de dono de restaurante, não
 * dashboard de engenharia.
 */
export const fmtBRLShort = (n: number) => {
  if (n === 0) return "—"
  const abs = Math.abs(n)
  const sinal = n < 0 ? "-" : ""
  const curto = (v: number, casas: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    })
  if (abs >= 1_000_000)
    // 1 casa até 10 mi (R$ 5,7 mi), inteiro acima (R$ 12 mi) — a segunda
    // casa não muda decisão nenhuma nessa ordem de grandeza.
    return `${sinal}R$ ${curto(abs / 1_000_000, abs >= 10_000_000 ? 0 : 1)} mi`
  if (abs >= 1000) return `${sinal}R$ ${curto(abs / 1000, 1)} mil`
  return fmtBRL(n)
}

export const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(n)

export const fmtPct = (n: number) => `${n.toFixed(1)}%`
