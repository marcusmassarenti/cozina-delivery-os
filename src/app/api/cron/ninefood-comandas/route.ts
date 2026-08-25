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

    /**
     * A fila zerou — avisa, UMA VEZ SÓ.
     *
     * Backfill longo termina em silêncio: não tem tela e ninguém fica olhando
     * o `restantes` de um cron. O aviso existe pra que "acabou" seja um fato
     * com hora, e não uma suposição de quem lembrar de conferir.
     *
     * ⚠️ A TRAVA É AQUI, NÃO NO `enviarEmail`. A trava de duplicidade dele só
     * roda quando existe `holding_id` (`if (!forcar && input.holdingId)`), e
     * este aviso é interno, sem cliente — passaria direto. Sem esta conferência
     * ele sairia de novo toda vez que a fila esvaziasse depois de recolher
     * pedido novo, e aviso repetido é o caminho mais curto pra ninguém mais ler
     * os avisos.
     */
    if (r.restantes === 0 && r.pedidosLidos > 0) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin")
        const admin = createAdminClient()

        const { data: jaAvisado } = await admin
          .from("email_enviados")
          .select("id")
          .eq("tipo", "ninefood-comandas-fim")
          .is("erro", null)
          .limit(1)
          .maybeSingle()

        if (!jaAvisado) {
          const { data: resumo } = await admin.rpc("ninefood_comandas_resumo")
          const t = ((resumo ?? []) as Record<string, unknown>[])[0] ?? {}
          const { backfillComandasConcluido } = await import(
            "@/lib/email/templates"
          )
          const { enviarEmail } = await import("@/lib/email/enviar")
          const { assunto, html } = backfillComandasConcluido({
            pedidos: Number(t.pedidos) || 0,
            itens: Number(t.itens) || 0,
            promoLoja: Number(t.promo_loja) || 0,
            lojas: Number(t.lojas) || 0,
            de: (t.de as string | null) ?? null,
            ate: (t.ate as string | null) ?? null,
          })
          await enviarEmail({
            holdingId: null,
            tipo: "ninefood-comandas-fim",
            para: process.env.SAUDE_EMAIL ?? "marcus@massarenti.me",
            assunto,
            html,
          })
        }
      } catch (e) {
        // O aviso é cortesia; a fila é o trabalho. Falhar aqui não pode
        // devolver 500 e fazer a rodada parecer quebrada.
        console.error("[ninefood-comandas] aviso de fim:", e)
      }
    }

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
