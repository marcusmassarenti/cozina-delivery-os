/**
 * Cálculo do Fechamento de sociedade (acerto 50/50) — módulo NEUTRO
 * (sem server-only), usado pelo form (client), pela página de impressão
 * (server) e pela camada de dados.
 *
 * Regras do acerto (bloco 4):
 *  - CNPão e B2B: transferência entre sócios — SOMA pra Cozina, DESCONTA do
 *    JK (a loja consumiu/vendeu, então paga a Cozina). Não muda o total.
 *  - Luz / Guarda / Outros: custo compartilhado 50/50 pago FORA do caixa da
 *    operação (de bolso, pelo JK que opera a loja). O split do recebido só
 *    rebalanceia: a Cozina contribui com metade via repasse — JK recebe a
 *    metade dela e Cozina desconta. Por isso ambos os modos ("dividir" e
 *    "reembolsar") têm o mesmo efeito no split: { jk: +h, cozina: -h }.
 *      • "dividir"     → o custo será dividido 50/50; assume que JK paga
 *                        a conta inteira e desconta a metade da Cozina no
 *                        split.
 *      • "reembolsar"  → o JK já pagou tudo (passado); a Cozina devolve a
 *                        metade dela via split (idêntico ao "dividir").
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

/**
 * Divide o lucro 50/50 e aplica os acertos do bloco 4.
 *
 * Cada sócio reembolsa o custo que bancou, por cima da metade do lucro:
 *  - O JK paga o vinagrete/maionese/bebidas → volta inteiro pro JK.
 *  - A Cozina produz (CMV) → o custo do produto volta inteiro pra Cozina.
 * Só depois entram os acertos/repasse. Assim o total fecha no recebido.
 *  - JK     = lucro/2 + vinagrete − acertos
 *  - Cozina = lucro/2 + produto + acertos
 *
 * @param produto    custo dos produtos (CMV Cozina) — volta inteiro pra Cozina
 * @param vinagrete  custo do vinagrete/maionese/bebidas — volta inteiro pro JK
 */
export function computeSplit(
  lucro: number,
  produto: number,
  vinagrete: number,
  a: Acerto,
): {
  half: number
  jkBase: number
  cozinaBase: number
  jk: number
  cozina: number
} {
  const half = lucro / 2
  const jkBase = half + (vinagrete || 0) // vinagrete volta inteiro pro JK
  const cozinaBase = half + (produto || 0) // produto (CMV) volta inteiro pra Cozina

  // Custo compartilhado pago FORA do caixa da operação (pelo JK, de bolso):
  // o split do recebido só rebalanceia — a Cozina contribui com a metade
  // dela via repasse. JK recebe +h, Cozina desconta h. Em ambos os modes.
  const shared = (val: number, _mode: AcertoMode) => {
    const h = (val || 0) / 2
    return { jk: h, cozina: -h }
  }
  const luz = shared(a.luz, a.luzMode)
  const guarda = shared(a.guarda, a.guardaMode)
  const outros = shared(a.outros, a.outrosMode)

  // CNPão + B2B → soma Cozina, desconta JK
  const transfer = (a.cnpao || 0) + (a.b2b || 0)

  const jk = jkBase - transfer + luz.jk + guarda.jk + outros.jk
  const cozina = cozinaBase + transfer + luz.cozina + guarda.cozina + outros.cozina
  return { half, jkBase, cozinaBase, jk, cozina }
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
    const suffix = mode === "reembolsar" ? "reembolsa JK" : "÷ 2"
    return { key, label: `${label} (${suffix})`, jk: half, cozina: -half }
  }
  if (a.luz) lines.push(shared("luz", "Luz", a.luz, a.luzMode))
  if (a.guarda) lines.push(shared("guarda", "Guarda", a.guarda, a.guardaMode))
  if (a.outros) lines.push(shared("outros", "Outros", a.outros, a.outrosMode))
  return lines
}
