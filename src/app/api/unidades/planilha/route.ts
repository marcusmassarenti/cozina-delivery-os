/**
 * Baixa a planilha de unidades. Dois arquivos, uma rota:
 *
 *   ?tipo=modelo  → VAZIA, pra cadastrar lojas novas em massa
 *   ?tipo=dados   → as lojas atuais preenchidas, pra conferir/corrigir
 *
 * São rotas e não server actions porque o resultado é um ARQUIVO: server
 * action devolve dado pro React, e pra virar download o xlsx inteiro teria que
 * passar como base64 no payload do RSC. Uma rota devolve os bytes direto.
 */
import { assertCanView } from "@/lib/auth/permissions"
import { gerarPlanilhaUnidades } from "@/lib/unidades/planilha-modelo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  // Mesmo portão da tela: quem não vê Unidades não baixa a lista delas.
  await assertCanView("unidades")

  const tipo = new URL(req.url).searchParams.get("tipo")
  // O padrão é o MODELO. Se um link vier sem parâmetro (favorito antigo,
  // atalho colado), o pior que acontece é a pessoa receber um arquivo vazio —
  // e não a lista de lojas dela sem ter pedido.
  const comDados = tipo === "dados"

  const bytes = await gerarPlanilhaUnidades({ comDados })
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
  const nome = comDados
    ? `minhas-unidades-${hoje}.xlsx`
    : "modelo-cadastro-de-unidades.xlsx"

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      // Sem cache: a exportação carrega o estado do cadastro, que muda.
      "Cache-Control": "no-store",
    },
  })
}
