/**
 * Cálculo do Fechamento de sociedade (acerto 50/50) — módulo NEUTRO
 * (sem server-only), usado pelo form (client), pela página de impressão
 * (server) e pela camada de dados.
 *
 * Regras do acerto (bloco 4):
 *  - CNPão e B2B: transferência entre sócios — SOMA pra Cozina, DESCONTA do
 *    JK (a loja consumiu/vendeu, então paga a Cozina). Não muda o total.
 *  - Luz / Guarda / Outros: custo compartilhado 50/50.
 *      • "dividir"     → cada um paga metade (desconta dos dois).
 *      • "reembolsar"  → o JK já pagou tudo; a Cozina devolve a metade dela
 *                        (JK recebe a mais, Cozina desconta).
 */

export type AcertoMode = "dividir" | "reembolsar"

export type Acerto = {
  cnpao: number
  b2b: number
  luz: number
  luzMode: AcertoMode
  guarda: number
  guardaMode: AcertoMode
  outros: number
  outrosMode: AcertoMode
  outrosObs: string
}

export const EMPTY_ACERTO: Acerto = {
  cnpao: 0,
  b2b: 0,
  luz: 0,
  luzMode: "dividir",
  guarda: 0,
  guardaMode: "dividir",
  outros: 0,
  outrosMode: "dividir",
  outrosObs: "",
}

/** Normaliza um jsonb solto pra Acerto (defaults + tipos). */
export function toAcerto(raw: unknown): Acerto {
  const a = (raw ?? {}) as Partial<Acerto>
  const mode = (m: unknown): AcertoMode =>
    m === "reembolsar" ? "reembolsar" : "dividir"
  const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)
  return {
    cnpao: num(a.cnpao),
    b2b: num(a.b2b),
    luz: num(a.luz),
    luzMode: mode(a.luzMode),
    guarda: num(a.guarda),
    guardaMode: mode(a.guardaMode),
    outros: num(a.outros),
    outrosMode: mode(a.outrosMode),
    outrosObs: typeof a.outrosObs === "string" ? a.outrosObs : "",
  }
}

export type RecebidoCustos = {
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  vr: number
  custoProdutos: number
  custoVinagrete: number
}

/** Recebido total = plataformas + VR. */
export function recebidoTotal(f: RecebidoCustos): number {
  return f.recebidoIfood + f.recebidoKeeta + f.recebido99 + f.vr
}

/** Lucro líquido = recebido (com VR) − custos. */
export function lucroLiquido(f: RecebidoCustos): number {
  return recebidoTotal(f) - f.custoProdutos - f.custoVinagrete
}

/** Divide o lucro 50/50 e aplica os acertos do bloco 4. */
export function computeSplit(
  lucro: number,
  a: Acerto,
): { base: number; jk: number; cozina: number } {
  const base = lucro / 2

  // custo compartilhado → metade pra cada
  const shared = (val: number, mode: AcertoMode) => {
    const half = (val || 0) / 2
    return mode === "reembolsar"
      ? { jk: half, cozina: -half } // JK pagou tudo → Cozina reembolsa a metade
      : { jk: -half, cozina: -half } // dividir → cada um paga a sua
  }
  const luz = shared(a.luz, a.luzMode)
  const guarda = shared(a.guarda, a.guardaMode)
  const outros = shared(a.outros, a.outrosMode)

  // CNPão + B2B → soma Cozina, desconta JK
  const transfer = (a.cnpao || 0) + (a.b2b || 0)

  const jk = base - transfer + luz.jk + guarda.jk + outros.jk
  const cozina = base + transfer + luz.cozina + guarda.cozina + outros.cozina
  return { base, jk, cozina }
}

export type AcertoLine = {
  key: string
  label: string
  jk: number
  cozina: number
}

/** Linhas de acerto não-zero, com o efeito (R$) em cada sócio. */
export function acertoBreakdown(a: Acerto): AcertoLine[] {
  const lines: AcertoLine[] = []
  if (a.cnpao)
    lines.push({ key: "cnpao", label: "CNPão → Cozina", jk: -a.cnpao, cozina: a.cnpao })
  if (a.b2b)
    lines.push({ key: "b2b", label: "B2B → Cozina", jk: -a.b2b, cozina: a.b2b })
  const shared = (key: string, label: string, val: number, mode: AcertoMode) => {
    const half = val / 2
    return mode === "reembolsar"
      ? { key, label: `${label} (reembolsa JK)`, jk: half, cozina: -half }
      : { key, label: `${label} (÷ 2)`, jk: -half, cozina: -half }
  }
  if (a.luz) lines.push(shared("luz", "Luz", a.luz, a.luzMode))
  if (a.guarda) lines.push(shared("guarda", "Guarda", a.guarda, a.guardaMode))
  if (a.outros) lines.push(shared("outros", "Outros", a.outros, a.outrosMode))
  return lines
}
