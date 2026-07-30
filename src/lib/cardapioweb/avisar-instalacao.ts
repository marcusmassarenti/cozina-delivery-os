/**
 * Avisa o dono da plataforma que entrou uma loja nova no Cardápio Web.
 *
 * Existe porque essa conexão é a única que acontece INTEIRA do lado do
 * cliente: ele autoriza no portal dele e pronto — não passa por fila, não pede
 * aprovação, ninguém aqui clica em nada. Sem aviso, a conexão existe e nós não
 * sabemos.
 *
 * Nunca lança: a instalação já está gravada quando isto roda, e falhar o
 * e-mail não pode fazer o cliente ver erro numa conexão que deu certo.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEmail } from "@/lib/email/enviar"

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

export async function avisarInstalacaoNova(d: {
  merchantName: string
  ambiente: string
  unitId: string | null
  holdingId: string | null
}): Promise<void> {
  const admin = createAdminClient()

  const [uni, hold] = await Promise.all([
    d.unitId
      ? admin.from("units").select("code, name").eq("id", d.unitId).maybeSingle()
      : Promise.resolve({ data: null }),
    d.holdingId
      ? admin.from("holdings").select("name").eq("id", d.holdingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const cliente = (hold.data as { name?: string } | null)?.name ?? "cliente não identificado"
  const u = uni.data as { code?: string; name?: string } | null
  const unidade = u ? `${u.code ? `${u.code} · ` : ""}${u.name}` : "sem unidade vinculada"
  const sandbox = d.ambiente !== "producao"

  await enviarEmail({
    holdingId: null,
    tipo: "cardapioweb-instalacao",
    para: DESTINO,
    assunto: `${sandbox ? "[sandbox] " : ""}Cardápio Web: ${cliente} conectou ${d.merchantName}`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#18181b;">
  <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:1.4px;color:#71717a;text-transform:uppercase;">Delivery OS · Cardápio Web</p>
  <h1 style="margin:0 0 16px;font-size:20px;">Loja nova conectada</h1>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.7;">
    <tr><td style="padding-right:16px;color:#71717a;">Cliente</td><td><strong>${cliente}</strong></td></tr>
    <tr><td style="padding-right:16px;color:#71717a;">Loja</td><td><strong>${d.merchantName}</strong></td></tr>
    <tr><td style="padding-right:16px;color:#71717a;">Unidade</td><td>${unidade}</td></tr>
    <tr><td style="padding-right:16px;color:#71717a;">Ambiente</td><td>${d.ambiente}</td></tr>
  </table>
  ${
    sandbox
      ? `<p style="margin:16px 0 0;font-size:13px;color:#92400e;background:#fffbeb;border-left:3px solid #d97706;padding:10px 12px;">Foi em <strong>sandbox</strong> — o faturamento desta loja não entra em conta nenhuma. Se era pra valer, a conexão precisa ser refeita em produção.</p>`
      : ""
  }
  <p style="margin:20px 0 0;"><a href="${SITE}/integracao/cardapioweb" style="color:#ff4d1c;font-weight:600;">Ver as conexões do Cardápio Web</a></p>
</div>`.trim(),
    // Uma loja nova é sempre notícia nova, mesmo que já tenha vindo outra
    // deste cliente antes. A trava padrão engoliria da segunda em diante.
    forcar: true,
  })
}
