/**
 * Cron do backfill de COMANDAS do 99 Food.
 *
 * ── POR QUE UM CRON SÓ PRA ISSO ──────────────────────────────────────────
 * A 99 não tem endpoint de relatório de itens vendidos (levantei a árvore
 * inteira da doc em 25/08/26). O que existe é o `Get Order Details`, que
 * devolve a comanda de UM pedido e aceita 10 req/10s — 1 por segundo.
 *
 * Com 18 mil pedidos sem comanda, isso é ~5 horas de chamadas. Não cabe em
 * lugar nenhum que alguém esteja esperando: nem num botão, nem no rabo do
 * sync diário. Tem que ser fila, com teto por rodada e rodando devagar.
 *
 * ⚠️ E NÃO É UMA TAREFA QUE ACABA. Loja vinculada por API cujo webhook não
 * está configurado continua produzindo pedido sem comanda todo dia. A fila
 * drena o histórico e depois vira manutenção — algumas dezenas por rodada, de
 * graça.
 *
 * O teto: 200 pedidos × 1,1s = 220s, dentro do orçamento de 240s. Rodando de
 * 5 em 5 minutos dá ~2.400 pedidos/hora, então o histórico inteiro sai em
 * menos de um dia.
 *
 * ⏰ A expressão do agendamento mora no vercel.json e NÃO pode ser copiada
 * pra este comentário: ela contém a sequência que FECHA o bloco de comentário
 * e o arquivo inteiro vira código inválido (já derrubou o build em 09/08/26).
 */
import { backfillComandas99 } from "@/lib/ninefood/comandas"
import { registrarCron } from "@/lib/cron/registrar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  return registrarCron("ninefood-comandas", async () => {
    const r = await backfillComandas99({ limite: 200, deadlineMs: 240_000 })
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...r,
      // O número a acompanhar. Parado por várias rodadas seguidas significa
      // que a fila não está andando — e fila que não anda dizendo "ok" é
      // exatamente como o backfill do iFood escondeu 23 lojas paradas.
      restantes: r.restantes,
    })
  })
}
