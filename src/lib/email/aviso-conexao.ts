/**
 * Moldura dos avisos INTERNOS de conexão (iFood, 99 Food, Cardápio Web).
 *
 * Existe porque o segundo aviso (99 Food) ia copiar ~60 linhas de HTML quase
 * idênticas ao do iFood. Neste projeto, regra duplicada já divergiu na prática
 * — a lista de canais próprios existia em dois arquivos e um deles esqueceu o
 * totem. Melhor um lugar só desde o começo.
 *
 * O que varia por plataforma é só: o rótulo do cabeçalho, o título, as linhas
 * da tabela e a frase de "de quem é a bola agora".
 */
import "server-only"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

/** Uma linha "rótulo → valor" da tabelinha do e-mail. */
export function linhaAviso(rotulo: string, valor: string): string {
  return `<tr><td style="padding-right:16px;color:#71717a;">${rotulo}</td><td>${valor}</td></tr>`
}

export function montarAvisoConexao(d: {
  /** Aparece no topo, ex.: "iFood" ou "99 Food". */
  plataforma: string
  titulo: string
  /** Linhas já montadas com linhaAviso(). */
  linhas: string
  /** De quem é a próxima ação. Aceita <strong>. */
  proximoPasso: string
  /** Caminho do link (a partir do domínio), ex.: "/clientes/conexoes". */
  acaoHref: string
  acaoTexto: string
}): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#18181b;">
  <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:1.4px;color:#71717a;text-transform:uppercase;">Delivery OS · ${d.plataforma}</p>
  <h1 style="margin:0 0 16px;font-size:20px;">${d.titulo}</h1>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.7;">
    ${d.linhas}
  </table>
  <p style="margin:16px 0 0;font-size:13px;color:#1e40af;background:#eff6ff;border-left:3px solid #2563eb;padding:10px 12px;">${d.proximoPasso}</p>
  <p style="margin:20px 0 0;"><a href="${SITE}${d.acaoHref}" style="color:#ff4d1c;font-weight:600;">${d.acaoTexto}</a></p>
</div>`.trim()
}

/** CNPJ legível (00.000.000/0000-00). Entra só dígito; devolve como veio se
 *  não tiver 14 — e-mail com CNPJ truncado é pior que CNPJ cru. */
export function cnpjBonito(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "")
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Nome do cliente e da unidade, pra mensagem não falar em UUID. */
export async function contextoConexao(
  holdingId: string,
  unitId: string | null,
): Promise<{ cliente: string; unidade: string }> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()
  const [hold, uni] = await Promise.all([
    admin.from("holdings").select("name").eq("id", holdingId).maybeSingle(),
    unitId
      ? admin.from("units").select("code, name").eq("id", unitId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const u = uni.data as { code?: string; name?: string } | null
  return {
    cliente:
      (hold.data as { name?: string } | null)?.name ?? "cliente não identificado",
    unidade: u ? `${u.code ? `${u.code} · ` : ""}${u.name}` : "—",
  }
}
