/**
 * Emissão automática de NF — diagnóstico.
 *
 * A config de nota é POR ASSINATURA no Asaas: ter o módulo fiscal ligado na
 * conta só permite emitir na mão. Toda assinatura NOVA já nasce configurada
 * (ver src/app/assinatura/_actions.ts).
 *
 * Esta rota é só o DIAGNÓSTICO (GET, não muda nada): confere se o código de
 * serviço que enviamos existe no catálogo da prefeitura e quantas assinaturas
 * ainda estão sem a config.
 *
 * Pra APLICAR nas assinaturas existentes, o botão fica em /plataforma — assim
 * não precisa de console do navegador nem de uma rota POST exposta à toa.
 *
 * Segurança: só super-admin (é a conta fiscal da empresa).
 */
import { isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  asaasGetSubscriptionInvoiceSettings,
  asaasIsMock,
  asaasListMunicipalServices,
  type AsaasMunicipalService,
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

  // Atenção: isto é o CATÁLOGO da prefeitura (todos os códigos de serviço que
  // o município aceita), não os serviços que cadastramos no painel. Serve pra
  // conferir se o código que enviamos existe e qual ISS a prefeitura associa.
  const catalogo = (servicosNoAsaas ?? []) as AsaasMunicipalService[]

  // Compara sem zero à esquerda: o painel exibe "02660", o catálogo devolve
  // "2660". São o mesmo serviço — comparar cru daria falso negativo.
  const semZero = (s: string) => s.replace(/^0+/, "")
  const codigo = semZero(enviaremos.municipalServiceCode)
  const casa = catalogo.filter(
    (s) => semZero((s.description ?? "").split("|")[0]!.trim()) === codigo,
  )

  // Pergunta pro Asaas, assinatura por assinatura, se a emissão automática
  // está ligada. Isto é a fonte da verdade — a lista de notas agendadas não é.
  const porAssinatura = await Promise.all(
    (assinaturas ?? []).map(async (h) => {
      const cfg = await asaasGetSubscriptionInvoiceSettings(
        h.asaas_subscription_id as string,
      )
      return {
        empresa: h.name as string,
        assinatura: h.asaas_subscription_id as string,
        emiteAutomatico: cfg !== null,
        config: cfg,
      }
    }),
  )

  return Response.json({
    // A pergunta que importa: cada assinatura emite nota sozinha?
    emissaoAutomatica: porAssinatura,
    semEmissaoAutomatica: porAssinatura.filter((a) => !a.emiteAutomatico).length,
    enviaremos,
    // Confere se o código que enviamos existe no catálogo da prefeitura:
    codigoConfere: casa.length > 0,
    codigoNoCatalogo: casa,
    catalogoDaPrefeitura: catalogo,
    erroAoListarCatalogo: erro,
    comoAplicar: "Botão 'Aplicar nas assinaturas' em /plataforma",
  })
}
