/**
 * Cron do BACKFILL do histórico do iFood — separado do auto-vínculo.
 *
 * POR QUE EXISTE (14/08/26): os dois trabalhos moravam no mesmo cron e
 * disputavam a mesma janela de 240s. O auto-vínculo pode levar 150s (cada CNPJ
 * desconhecido custa o download de uma conciliação) e o backfill reserva 180s
 * por loja — bastava o primeiro passar de 60s pra que TODAS as lojas caíssem
 * em "adiado". A fila congelou em 8 lojas por mais de duas horas com todas as
 * rodadas terminando `ok: true`. Fome silenciosa: o cron dizia que trabalhou.
 *
 * Separar é o conserto de verdade; alternar dentro do mesmo cron era remendo.
 * Aqui a janela inteira é do backfill, e ele roda de 5 em 5 minutos em vez de
 * a cada 30 — de ~1 loja/30min para ~12 lojas/hora.
 *
 * ⏰ A expressão do agendamento mora no vercel.json e NÃO pode ser copiada
 * pra este comentário: ela contém a sequência que FECHA o bloco, e o arquivo
 * inteiro vira código inválido (derrubou o build em 09/08/26).
 *
 * O TETO CONTINUA: `MAX_BACKFILL_POR_RODADA` e a reserva de tempo por loja
 * vivem em `backfillPendentes`. Com 200s de orçamento sai ~1 loja por rodada.
 * Subir isso é afinar número contra o limite de chamadas do iFood, que é por
 * APLICAÇÃO e não por loja — apertar aqui degrada o sync diário de todos os
 * outros clientes. Não mexer sem medir.
 *
 * Orçamento de 200s (e não 240s) de propósito: rodando a cada 5 minutos, uma
 * execução tem que terminar com folga antes da seguinte começar. Duas rodadas
 * sobrepostas pegariam a MESMA loja — o carimbo só é gravado no fim.
 */
import { backfillPendentes } from "@/lib/ifood/auto-link"
import { avisarConexaoAtivada } from "@/lib/email/conexao-ativada"
import { createAdminClient } from "@/lib/supabase/admin"
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

  return registrarCron("ifood-backfill", async () => {
    const admin = createAdminClient()
    const hist = await backfillPendentes({ deadlineMs: 200_000 })

    /**
     * Avisa o cliente só de quem ACABOU de completar o histórico.
     *
     * Avisar uma loja recém-vinculada e ainda sem o ano mostraria dois meses
     * no lugar de doze — e o e-mail sai uma vez só, então essa primeira
     * impressão seria a definitiva. `soSeCompleto` ainda segura quem autorizou
     * só um dos dois apps do iFood; essas seguem pra varredura das 7h, onde a
     * frase "faltam as avaliações" é verdade.
     */
    const avisados: string[] = []
    for (const b of hist.backfill) {
      const antes = await admin
        .from("unit_platforms")
        .select("email_conectado_at")
        .eq("unit_id", b.unitId)
        .eq("platform", "ifood")
        .maybeSingle()
      if (antes.data?.email_conectado_at) continue

      // Nunca lança — o dado já entrou, que é o que importa.
      await avisarConexaoAtivada(b.unitId, "ifood", { soSeCompleto: true })

      const depois = await admin
        .from("unit_platforms")
        .select("email_conectado_at")
        .eq("unit_id", b.unitId)
        .eq("platform", "ifood")
        .maybeSingle()
      if (depois.data?.email_conectado_at) avisados.push(b.unitName)
    }

    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      historico: hist.backfill.map(
        (b) => `${b.unitCode} ${b.unitName}: ${b.meses} meses, ${b.linhas} linhas`,
      ),
      // O tamanho da fila que sobra é o número a acompanhar: parado por várias
      // rodadas seguidas significa que ninguém está sendo servido.
      naFila: hist.backfillAdiado.length,
      avisados,
    })
  })
}
