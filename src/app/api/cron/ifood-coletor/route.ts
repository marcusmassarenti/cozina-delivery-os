/**
 * Cron do COLETOR de extratos do iFood.
 *
 * O sync diário PEDE os extratos; este vai buscar. Roda de poucos em poucos
 * minutos porque a espera curta só funciona se a volta for rápida — ver o
 * cabeçalho de `coletor-extratos.ts` pra história inteira.
 *
 * ⏰ A expressão do agendamento mora no vercel.json e NÃO pode ser copiada
 * pra este comentário: ela contém a sequência que FECHA o bloco e derruba o
 * build (aconteceu em 09/08/26).
 *
 * Barato quando não há nada: a primeira query é na fila; vazia, sai na hora
 * sem falar com o iFood.
 */
import { coletarExtratosPendentes } from "@/lib/ifood/coletor-extratos"
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

  return registrarCron("ifood-coletor", async () => {
    const r = await coletarExtratosPendentes({ deadlineMs: 200_000 })
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...r,
      // Resumo em uma linha pro relatório de saúde: o que importa é se a fila
      // ANDA. Parada por várias rodadas seguidas com o mesmo número é o
      // sintoma que o coletor existe pra não deixar acontecer de novo.
      resumo:
        `fila ${r.naFila} · ${r.emQuarentena} em quarentena (403) · ` +
        `conferidos ${r.conferidos} · ${r.pedidosNovos} pedidos novos · ` +
        `${r.prontos} prontos · ${r.coletados.length} coletados · ` +
        `${r.aindaGerando} ainda gerando · ${r.falhas.length} falha(s)`,
    })
  })
}
