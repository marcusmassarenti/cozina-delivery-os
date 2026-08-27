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
import { cardapiowebInstalacao } from "@/lib/email/templates"

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"

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
    ...cardapiowebInstalacao({
      cliente,
      loja: d.merchantName,
      unidade,
      sandbox,
    }),
    forcar: true,
  })
}
