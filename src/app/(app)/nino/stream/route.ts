import { perguntarConsultorStream } from "@/lib/data/ia-chat"
import type { ChatTurn } from "@/lib/anthropic/client"

// Precisa de service_role (admin client) e streaming ao vivo → runtime node,
// sem cache. A resposta sai como NDJSON (uma linha JSON por evento).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  let body: { conversaId?: string | null; messages?: ChatTurn[] }
  try {
    body = await req.json()
  } catch {
    return new Response("Requisição inválida.", { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evt: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"))
      try {
        for await (const evt of perguntarConsultorStream(
          body.conversaId ?? null,
          body.messages ?? [],
        )) {
          enviar(evt)
        }
      } catch (e) {
        console.error("/nino/stream: erro inesperado:", e)
        enviar({
          type: "error",
          motivo: "erro",
          mensagem: "Erro inesperado. Tente de novo.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  })
}
