/**
 * Aceita CNPJ com ou sem máscara; devolve só os 14 dígitos — e CONFERE os dois
 * dígitos verificadores.
 *
 * Contar 14 dígitos não é validar: "11.111.111/1111-11" tem 14. Um dígito
 * trocado passava batido, virava solicitação, e só morria dias depois quando
 * alguém percebia na mão que o CNPJ não existia no iFood. Com o verificador,
 * o erro de digitação morre na hora, na tela de quem digitou.
 *
 * Mora aqui, e não junto da server action, porque arquivo com "use server" só
 * pode exportar função assíncrona — exportar esta de lá quebra o build.
 */
export function normalizarCnpj(raw: string): string | null {
  const d = raw.replace(/\D/g, "")
  if (d.length !== 14) return null
  if (/^(\d)\1{13}$/.test(d)) return null // 000…0, 111…1 — passam na conta

  const dv = (base: string, pesoInicial: number): number => {
    let peso = pesoInicial
    let soma = 0
    for (const ch of base) {
      soma += Number(ch) * peso
      peso = peso === 2 ? 9 : peso - 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  if (dv(d.slice(0, 12), 5) !== Number(d[12])) return null
  if (dv(d.slice(0, 13), 6) !== Number(d[13])) return null
  return d
}
