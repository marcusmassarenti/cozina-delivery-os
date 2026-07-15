/**
 * Emissão automática de NF — diagnóstico e configuração das assinaturas.
 *
 * A config de nota é POR ASSINATURA no Asaas: ter o módulo fiscal ligado na
 * conta só permite emitir na mão. Toda assinatura NOVA já nasce configurada
 * (ver src/app/assinatura/_actions.ts). Esta rota existe pra:
 *
 *   GET  → confere o que o Asaas tem: serviços municipais cadastrados na
 *          conta + o que a gente mandaria. Não muda nada.
 *   POST → aplica a config nas assinaturas que JÁ existem (as criadas antes
 *          disso ficaram sem). Idempotente: pode rodar de novo sem estragar.
 *
 * Segurança: só super-admin (é a conta fiscal da empresa).
 */
import { isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  asaasIsMock,
  asaasListMunicipalServices,
  asaasSetSubscriptionInvoiceSettings,
} from "@/lib/asaas/client"
import { fiscalInvoiceSettings } from "@/lib/asaas/fiscal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Confere: o que está cadastrado no Asaas vs. o que a gente enviaria. */
export async function GET() {
  if (!(await isSuperadmin())) {
    return new Response("Unauthorized", { status: 401 })
  }
  if (asaasIsMock()) {
    return Response.json({
      erro: "ASAAS_API_KEY não configurada neste ambiente (modo simulado).",
    })
  }

  const enviaremos = fiscalInvoiceSettings()
  let servicosNoAsaas: unknown = null
  let erro: string | null = null
  try {
    servicosNoAsaas = await asaasListMunicipalServices()
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  const admin = createAdminClient()
  const { data: assinaturas } = await admin
    .from("holdings")
    .select("id, name, asaas_subscription_id")
    .not("asaas_subscription_id", "is", null)

  return Response.json({
    // Confira se municipalServiceCode bate com algum código daqui:
    servicosCadastradosNoAsaas: servicosNoAsaas,
    erroAoListarServicos: erro,
    enviaremos,
    assinaturasQueSeriamConfiguradas: assinaturas?.length ?? 0,
    comoAplicar: "POST nesta mesma URL",
  })
}

/** Aplica a config de emissão automática em todas as assinaturas existentes. */
export async function POST() {
  if (!(await isSuperadmin())) {
    return new Response("Unauthorized", { status: 401 })
  }
  if (asaasIsMock()) {
    return Response.json(
      { erro: "ASAAS_API_KEY não configurada neste ambiente." },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: holdings } = await admin
    .from("holdings")
    .select("id, name, asaas_subscription_id")
    .not("asaas_subscription_id", "is", null)

  const settings = fiscalInvoiceSettings()
  const ok: string[] = []
  const falhou: Array<{ holding: string; erro: string }> = []

  for (const h of holdings ?? []) {
    const subId = h.asaas_subscription_id as string
    try {
      await asaasSetSubscriptionInvoiceSettings(subId, settings)
      ok.push(`${h.name as string} (${subId})`)
    } catch (e) {
      falhou.push({
        holding: `${h.name as string} (${subId})`,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return Response.json({
    configuradas: ok.length,
    falharam: falhou.length,
    ok,
    falhou,
  })
}
