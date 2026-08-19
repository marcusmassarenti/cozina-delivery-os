/**
 * Cron diário do Cardápio Web (Vercel Cron — ver vercel.json).
 *
 * Cada rodada faz, por loja conectada: pedidos novos, mais uma janela de 30
 * dias de histórico pra trás (até 1º de janeiro do ano corrente) e um lote de
 * detalhamento. O cursor em `cardapioweb_sync_state` faz a rodada seguinte
 * continuar de onde esta parou — por isso o histórico de um ano se completa
 * em algumas noites, sem ninguém clicar em nada.
 *
 * Por que ele existe: até aqui o Cardápio Web só sincronizava quando alguém
 * abria a tela e clicava. A tela de conexão dizia ao lojista que "os pedidos
 * novos passam a entrar sozinhos" — e não entravam. Com um cliente dá pra
 * levar na base do dedo; com trinta, não.
 *
 * Segurança: a Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem a env
 * CRON_SECRET batendo → 401.
 */
import { sincronizarTodas } from "@/lib/cardapioweb/sync"
import { registrarCron } from "@/lib/cron/registrar"
import { varrerConexoesNovas } from "@/lib/email/conexao-ativada"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Envelope de registro: deixa rastro em cron_runs pra o relatório diário
  // saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("cardapioweb-sync", async () => {
    try {
      const rs = await sincronizarTodas()

      const pedidos = rs.reduce(
        (s, r) => s + (r.incremental?.pedidos ?? 0) + (r.backfill?.pedidos ?? 0),
        0,
      )
      const detalhados = rs.reduce((s, r) => s + (r.detalhe?.processados ?? 0), 0)
      const naFila = rs.reduce((s, r) => s + (r.detalhe?.restantes ?? 0), 0)
      const comErro = rs.filter((r) => r.erro).length

      /**
       * Avisa quem fechou o histórico nesta rodada.
       *
       * O Cardápio Web traz o ano em janelas de 30 dias, uma por noite — o
       * e-mail "está conectado" leva os números dentro e sai uma vez só, então
       * ele espera `backfill_concluido`. `apenas` deixa o iFood de fora: o
       * cron dele às 6h ainda não passou pelas avaliações das 7h.
       */
      let avisos = { avaliadas: 0, enviados: 0 }
      try {
        avisos = await varrerConexoesNovas({ apenas: "cardapioweb" })
      } catch (e) {
        console.error("[cardapioweb] aviso de conexão:", e)
      }

      return Response.json({
        ok: true,
        ranAt: new Date().toISOString(),
        lojas: rs.length,
        pedidos,
        detalhados,
        naFila,
        // Quantas já puxaram o ano inteiro e esvaziaram a fila.
        concluidas: rs.filter((r) => r.concluido).length,
        avisos,
        comErro,
        detalhe: rs.map((r) => ({
          loja: r.loja,
          novos: r.incremental?.pedidos ?? 0,
          historico: r.backfill
            ? `${r.backfill.de} → ${r.backfill.ate}: ${r.backfill.pedidos}`
            : "concluído",
          detalhados: r.detalhe?.processados ?? 0,
          erro: r.erro ?? r.incremental?.erro ?? r.backfill?.erro ?? null,
        })),
      })
    } catch (e) {
      console.error("/api/cron/cardapioweb-sync:", e)
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
        { status: 500 },
      )
    }
  })
}
