/**
 * JSON canônico: mesma entrada, mesma string, sempre.
 *
 * É a base do hash dos dois aceites do sistema (proposta e Termo de Adesão).
 * Sem ordenar as chaves, o hash mudaria conforme a ordem em que o Postgres
 * devolvesse o JSONB — e um hash que muda sozinho não prova integridade
 * nenhuma, só gera a suspeita de adulteração que ele deveria afastar.
 *
 * Mora num arquivo só de propósito: se a proposta e o termo tivessem cada um
 * a sua cópia, bastaria uma delas mudar pra os comprovantes antigos de um dos
 * dois deixarem de bater.
 */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`
  const o = v as Record<string, unknown>
  const chaves = Object.keys(o).sort()
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`
}
