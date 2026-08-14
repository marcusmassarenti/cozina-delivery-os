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

// Mesma paleta dos e-mails de cliente (templates.ts). Aviso interno com outra
// cara faria parecer que saiu de outro sistema — e a caixa de entrada é a
// mesma.
const LARANJA = "#ff4d1c"
const TINTA = "#18181b"
const TEXTO = "#52525b"

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
<div style="margin:0;padding:32px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:32px 30px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
          <tr>
            <td style="padding-right:12px;">
              <img src="${SITE}/deliveryos-icon.png" width="36" height="36" alt="D"
                   style="display:block;width:36px;height:36px;border-radius:9px;background:${LARANJA};" />
            </td>
            <td style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#71717a;text-transform:uppercase;">Delivery OS · ${d.plataforma}</td>
          </tr>
        </table>

        <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:${TINTA};font-weight:700;">${d.titulo}</h1>

        <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.7;color:${TEXTO};">
          ${d.linhas}
        </table>

        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#7c2d12;background:#fff7ed;border-left:3px solid ${LARANJA};padding:11px 13px;border-radius:0 6px 6px 0;">${d.proximoPasso}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
          <tr><td>
            <a href="${SITE}${d.acaoHref}" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:14px;font-weight:700;">${d.acaoTexto}</a>
          </td></tr>
        </table>

      </td>
    </tr>
    <tr>
      <td align="center" style="padding:16px 0 0;font-size:12px;color:#a1a1aa;">
        Aviso interno do Delivery OS · deliveryos.food
      </td>
    </tr>
  </table>
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
