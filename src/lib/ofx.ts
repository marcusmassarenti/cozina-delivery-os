/**
 * Parser mínimo de OFX (extrato bancário). OFX é SGML-ish: os lançamentos
 * ficam em blocos <STMTTRN>. Extraímos data, valor, id (FITID) e histórico.
 * Tolera tags sem fechamento (formato antigo de banco).
 */

export type OfxTransacao = {
  fitId: string
  /** YYYY-MM-DD */
  data: string
  /** valor com sinal (negativo = saída) */
  valor: number
  descricao: string
}

/** Pega o conteúdo de uma tag SGML tolerando ausência de fechamento. */
function tag(bloco: string, nome: string): string | null {
  // <NOME>valor</NOME>  ou  <NOME>valor(\n ou próxima tag)
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i")
  const m = bloco.match(re)
  return m ? m[1].trim() : null
}

/** DTPOSTED vem como YYYYMMDD[HHMMSS][.mmm][tz] → YYYY-MM-DD. */
function parseData(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/[^0-9]/g, "")
  if (s.length < 8) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function parseValor(raw: string | null): number | null {
  if (!raw) return null
  // aceita 1.234,56 ou 1234.56 ou -12,30
  const s = raw.trim()
  let norm = s
  if (s.includes(",") && s.includes(".")) norm = s.replace(/\./g, "").replace(",", ".")
  else if (s.includes(",")) norm = s.replace(",", ".")
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

export type OfxResultado = {
  transacoes: OfxTransacao[]
  /** true se o arquivo parece OFX mas não achou nenhuma transação. */
  vazio: boolean
  /** true se nem parece OFX. */
  invalido: boolean
}

export function parseOfx(conteudo: string): OfxResultado {
  if (!conteudo || (!/OFX/i.test(conteudo) && !/<STMTTRN>/i.test(conteudo))) {
    return { transacoes: [], vazio: false, invalido: true }
  }
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1)
  const transacoes: OfxTransacao[] = []
  for (const raw of blocos) {
    const bloco = raw.split(/<\/STMTTRN>/i)[0]
    const data = parseData(tag(bloco, "DTPOSTED"))
    const valor = parseValor(tag(bloco, "TRNAMT"))
    let fitId = tag(bloco, "FITID")
    const desc = tag(bloco, "MEMO") ?? tag(bloco, "NAME") ?? "Lançamento importado"
    if (!data || valor == null || valor === 0) continue
    // Sem FITID confiável → gera um estável pela data+valor+desc.
    if (!fitId) fitId = `${data}|${valor}|${desc}`.slice(0, 120)
    transacoes.push({ fitId, data, valor, descricao: desc })
  }
  return { transacoes, vazio: transacoes.length === 0, invalido: false }
}
