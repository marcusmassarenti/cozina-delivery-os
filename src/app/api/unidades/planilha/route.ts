/**
 * Baixa a planilha de unidades (modelo + as lojas atuais).
 *
 * É rota e não server action porque o resultado é um ARQUIVO: server action
 * devolve dado pro React, e pra virar download teria que passar o xlsx inteiro
 * como base64 pelo payload do RSC. Uma rota devolve os bytes direto.
 */
import { assertCanView } from "@/lib/auth/permissions"
import { gerarPlanilhaUnidades } from "@/lib/unidades/planilha-modelo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  // Mesmo portão da tela: quem não vê Unidades não baixa a lista delas.
  await assertCanView("unidades")

  const bytes = await gerarPlanilhaUnidades()
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="unidades-${hoje}.xlsx"`,
      // Sem cache: a planilha carrega o estado do cadastro, que muda.
      "Cache-Control": "no-store",
    },
  })
}
