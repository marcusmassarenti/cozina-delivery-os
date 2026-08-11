/**
 * Preview de e-mail RENDERIZADO PELO SERVIDOR, sem enviar.
 *
 * Existe porque `getRealMonthlyForUnits` usa `unstable_cache`, que só funciona
 * dentro do runtime do Next: script solto quebra com "incrementalCache
 * missing". Sem isto, o único jeito de conferir o número de um e-mail é
 * ENVIÁ-LO — e foi assim que um e-mail com 29% do faturamento real chegou a
 * ficar pronto pra sair.
 *
 *   /api/dev/preview-email                → loja compartilhada
 *   /api/dev/preview-email?tipo=conexao   → "sua loja está conectada" (iFood)
 *
 * Superadmin apenas. Não envia nada: renderiza e devolve o HTML.
 */
import { requireSuperadmin } from "@/lib/auth/guards"
import { getLojasCompartilhadasPorHolding } from "@/lib/data/lojas-compartilhadas"
import { contatoDaHolding } from "@/lib/email/contato-holding"
import { resumoDoAno } from "@/lib/email/resumo-da-loja"
import { lojaCompartilhada } from "@/lib/email/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  await requireSuperadmin()

  const tipo = new URL(req.url).searchParams.get("tipo")
  const mapa = await getLojasCompartilhadasPorHolding()
  const [holdingId, lojas] = [...mapa.entries()][0] ?? []
  if (!holdingId || !lojas?.[0]) return new Response("sem loja compartilhada")
  const loja = lojas[0]
  const contato = await contatoDaHolding(holdingId)

  if (tipo === "conexao") {
    const { conexaoAtivada } = await import("@/lib/email/templates")
    const { resumoDaLoja } = await import("@/lib/email/conexao-ativada")
    const r = await resumoDaLoja(loja.unitId, "ifood")
    const m = conexaoAtivada({
      nome: contato?.nome ?? null,
      loja: `#${loja.code} ${loja.name}`,
      plataforma: "iFood",
      linhas: r.linhas,
      pendencias: r.pendencias,
    })
    return new Response(m.html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const resumo = await resumoDoAno(loja.unitId)
  const m = lojaCompartilhada({
    nome: contato?.nome ?? null,
    loja: `#${loja.code} ${loja.name}`,
    dona: loja.donaNome,
    linhas: resumo.linhas,
    plataformas: resumo.plataformas,
  })
  return new Response(m.html, { headers: { "content-type": "text/html; charset=utf-8" } })
}
