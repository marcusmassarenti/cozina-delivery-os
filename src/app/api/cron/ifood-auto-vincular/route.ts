/**
 * Cron curto: fecha sozinho a conexão das lojas que o cliente já aprovou.
 *
 * Fluxo que ele completa: o cliente aprova no Portal do Parceiro → clica
 * "Já aprovei no iFood" (carimba `cliente_confirmou_at`) → e aqui a loja é
 * casada por CNPJ, vinculada e ativada. Do lado do cliente o card de "falta
 * aprovar" some e vira "sua loja foi conectada! 🎉".
 *
 * Por que não roda no clique do cliente: depois da aprovação, o merchant leva
 * alguns minutos pra aparecer no nosso GET /merchants. No instante do clique
 * ele quase nunca está lá — precisa de alguém que tente de novo. E descobrir
 * o CNPJ custa o download de uma conciliação, o que passa longe do tempo que
 * um clique de usuário pode esperar.
 *
 * Barato quando não há nada: a primeira query é um count; sem loja confirmada
 * esperando, sai antes de falar com o iFood.
 *
 * ⏰ Roda de 15 em 15 minutos — a expressão está no vercel.json, e NÃO pode
 * ser copiada pra cá: ela contém a sequência que FECHA este comentário, e o
 * arquivo inteiro vira código inválido (foi o que derrubou o build em
 * 09/08/26).
 *
 * Quem aprova no Portal do Parceiro espera minutos, não o dia seguinte. Quem
 * não quer nem isso usa o botão "Já autorizei — conferir e vincular" na tela
 * de merchants, que faz o mesmo na hora.
 *
 * ⚠️ HISTÓRICO, não regra atual: enquanto a conta Vercel era HOBBY, cron mais
 * frequente que diário FALHAVA O DEPLOY — não era aviso, o build quebrava, e
 * foi assim que 17 commits ficaram travados em 27/jul. Hoje a conta comporta
 * os 15 minutos. Guardado aqui só pra ninguém "consertar" a frequência de
 * volta pra diária achando que o limite ainda vale.
 */
import {
  autoLinkIfoodMerchants,
  backfillPendentes,
} from "@/lib/ifood/auto-link"
import { createAdminClient } from "@/lib/supabase/admin"
import { registrarCron } from "@/lib/cron/registrar"
import { avisarConexaoAtivada } from "@/lib/email/conexao-ativada"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("ifood-auto-vincular", async () => {

  const admin = createAdminClient()

  /**
   * Avisa o cliente na hora, sem esperar a varredura das 7h.
   *
   * Só para quem ACABOU de completar o backfill: avisar uma loja recém
   * vinculada e ainda sem histórico mostraria dois meses no lugar do ano
   * inteiro — e o e-mail sai uma vez só, então essa primeira impressão seria
   * a definitiva.
   *
   * `soSeCompleto` segura o envio quando falta uma das pontas do iFood. Quem
   * autorizou só um dos dois apps continua sendo avisado pela varredura das
   * 7h, depois que o cron de avaliações rodar — ali a frase "faltam as
   * avaliações" é verdade, e às 6h não seria.
   *
   * Sequencial de propósito: são poucas lojas por rodada (teto de 2 no
   * backfill) e o carimbo já protege contra envio duplo; disparar em paralelo
   * só adicionaria concorrência sem ganho de tempo perceptível.
   *
   * NÃO fica dentro de `backfillPendentes`: `scripts/backfill-historico-ifood.ts`
   * chama aquela função, e e-mail pra cliente saindo de execução manual de
   * script é surpresa que ninguém quer.
   */
  async function avisarBackfillados(
    feitas: { unitId: string; unitName: string }[],
  ): Promise<string[]> {
    const avisadas: string[] = []
    for (const b of feitas) {
      const antes = await admin
        .from("unit_platforms")
        .select("email_conectado_at")
        .eq("unit_id", b.unitId)
        .eq("platform", "ifood")
        .maybeSingle()
      if (antes.data?.email_conectado_at) continue

      // Nunca lança (ver a função) — o dado já entrou, que é o que importa.
      await avisarConexaoAtivada(b.unitId, "ifood", { soSeCompleto: true })

      const depois = await admin
        .from("unit_platforms")
        .select("email_conectado_at")
        .eq("unit_id", b.unitId)
        .eq("platform", "ifood")
        .maybeSingle()
      if (depois.data?.email_conectado_at) avisadas.push(b.unitName)
    }
    return avisadas
  }

  // Só as que o cliente CONFIRMOU: são as únicas em que faz sentido procurar
  // o merchant agora. As demais seguem no cron diário completo.
  const { data: esperando } = await admin
    .from("ifood_activation_requests")
    .select("unit_id")
    .eq("status", "solicitada")
    .not("cliente_confirmou_at", "is", null)

  const unitIds = ((esperando ?? []) as { unit_id: string | null }[])
    .map((r) => r.unit_id)
    .filter((v): v is string => Boolean(v))

  // Nada esperando vínculo NÃO significa nada a fazer: pode haver loja já
  // vinculada e sem histórico (a fila do backfill é por estado, não por
  // evento). Só sai cedo quando as duas filas estão vazias.
  if (unitIds.length === 0) {
    const so = await backfillPendentes({ deadlineMs: 240_000 })
    return Response.json({
      ok: true,
      esperando: 0,
      vinculadas: [],
      historico: so.backfill.map(
        (b) => `${b.unitCode} ${b.unitName}: ${b.meses} meses, ${b.linhas} linhas`,
      ),
      historicoNaFila: so.backfillAdiado.length,
      avisados: await avisarBackfillados(so.backfill),
    })
  }

  // Teto abaixo do maxDuration pra sobrar margem de resposta. O que não couber
  // fica pra próxima rodada — e o CNPJ descoberto agora deixa a próxima rápida.
  // Vincular primeiro (é rápido e é o que o cliente está esperando), depois
  // puxar o histórico com o tempo que sobrar.
  //
  // ⚠️ Este cron é quem DETECTA a autorização do cliente — de 15 em 15
  // minutos, sem ninguém avisar nada. Antes ele vinculava e parava aí: a loja
  // ficava com "mês corrente + anterior" até o cron das 6h alcançá-la, e se
  // não alcançasse (teto de 2 por rodada), ficava assim pra sempre. Puxar o
  // histórico aqui é o que fecha o ciclo "cliente aprovou → dado na tela".
  /**
   * ⚠️ OS DOIS TRABALHOS NÃO CABEM NA MESMA RODADA — por isso eles se
   * ALTERNAM em vez de dividir o tempo.
   *
   * O orçamento é de 240s. O auto-vínculo pode levar até 150s (cada CNPJ
   * desconhecido custa o download de uma conciliação) e UMA loja de backfill
   * leva ~160s. Somando, não cabe.
   *
   * Enquanto os dois disputavam a mesma janela, o backfill era servido com o
   * resto e `backfillPendentes` reserva 180s por loja — então bastava o
   * auto-vínculo passar de 60s pra sobrar menos que isso, e TODAS as lojas
   * caírem em "adiado". Foi o que aconteceu em 14/08/26: a partir das 16:45 o
   * auto-vínculo passou a levar 67–157s (28 merchants novos sem CNPJ), a fila
   * do backfill congelou em 8 lojas por mais de duas horas, e cada rodada
   * terminava `ok: true`. Fome silenciosa: o cron dizia que trabalhou.
   *
   * Alternar pelo relógio (:00 e :30 vinculam primeiro, :15 e :45 puxam
   * histórico primeiro) dá a cada um uma janela INTEIRA a cada 30 minutos, sem
   * estado novo pra guardar e sem depender de quem terminou antes.
   */
  const t0 = Date.now()
  const vezDoHistorico = Math.floor(new Date().getMinutes() / 15) % 2 === 1

  let r: Awaited<ReturnType<typeof autoLinkIfoodMerchants>>
  let hist: Awaited<ReturnType<typeof backfillPendentes>>

  if (vezDoHistorico) {
    hist = await backfillPendentes({ deadlineMs: 200_000 })
    const sobrou = 240_000 - (Date.now() - t0)
    r =
      sobrou > 20_000
        ? await autoLinkIfoodMerchants(unitIds, { deadlineMs: sobrou })
        : {
            ok: true,
            vinculadas: [],
            ambiguas: [],
            restantes: unitIds.length,
            merchantsVistos: 0,
          }
  } else {
    r = await autoLinkIfoodMerchants(unitIds, { deadlineMs: 150_000 })
    const sobrou = 240_000 - (Date.now() - t0)
    // 200s, não 60s: abaixo disso `backfillPendentes` adia tudo por dentro e a
    // chamada só gasta tempo pra devolver lista vazia. Os dois números têm que
    // concordar — foi a discordância entre eles que travou a fila.
    hist =
      sobrou > 200_000
        ? await backfillPendentes({ deadlineMs: sobrou })
        : { backfill: [], backfillAdiado: [] }
  }

  return Response.json({
    ok: r.ok,
    ranAt: new Date().toISOString(),
    esperando: unitIds.length,
    vinculadas: r.vinculadas.map((v) => `${v.unitCode} ${v.unitName}`),
    naoResolvidas: r.ambiguas.map((a) => `${a.unitName}: ${a.motivo}`),
    restantes: r.restantes,
    historico: hist.backfill.map(
      (b) => `${b.unitCode} ${b.unitName}: ${b.meses} meses, ${b.linhas} linhas`,
    ),
    historicoNaFila: hist.backfillAdiado.length,
    avisados: await avisarBackfillados(hist.backfill),
    error: r.error,
  })
  })
}
