/**
 * Relatório diário de saúde das integrações.
 *
 * Roda de manhã, diagnostica e manda UM e-mail interno com o veredito no
 * assunto. Não usa a trava de duplicidade da régua de clientes: aqui o certo é
 * mandar todo dia, inclusive em dia verde — silêncio ambíguo ("não recebi
 * nada: está tudo bem ou o relatório parou?") é o modo de falha que este
 * relatório existe pra eliminar.
 *
 * ⏰ De hora em hora, das 11:00 às 23:00 UTC (8h às 20h de Brasília), e ENVIA
 * na primeira janela em que a rotina do dia já fechou. A primeira é 8h porque
 * é logo depois do último cron diário (avaliações, 7h de Brasília) — antes
 * disso o relatório julgaria um dia que ainda não aconteceu.
 *
 * A janela começava às 11h de Brasília por causa de um bug, não por escolha: a
 * virada do dia estava em UTC, então a fila do coletor só virava às 21h e a
 * rotina nunca fechava de manhã. Com a virada em Brasília (src/lib/dia-br.ts)
 * ela fecha de madrugada, e às 8h o quadro já é o do dia inteiro.
 */
import { diagnosticarIntegracoes } from "@/lib/data/saude-integracoes"
import { emailSaude, type ConferenciaResumo } from "@/lib/email/saude"
import { resumoDaRodada, type RodadaDiaria } from "@/lib/data/rodada-diaria"
import { agruparSaude } from "@/lib/data/saude-agrupada"
import { conferirFontes } from "@/lib/data/conferencia-fontes"
import { enviarEmail } from "@/lib/email/enviar"
import { registrarCron } from "@/lib/cron/registrar"
import { medirInfra, type InfraMetricas } from "@/lib/data/infra-metricas"
import { estadoDoPipeline, saudeJaSaiuHoje } from "@/lib/data/pipeline-do-dia"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  /**
   * `?forcar=1` reenvia mesmo já tendo saído hoje.
   *
   * Existe pra conferir mudança no relatório sem esperar o dia seguinte — foi
   * o que faltou em 18/08/26, quando o bloco de "loja sumida" entrou e não
   * havia como olhar o resultado. Fica atrás do mesmo CRON_SECRET, e o destino
   * é interno (SAUDE_EMAIL), então o pior caso é um e-mail repetido pra nós.
   *
   * Pula as duas saídas antecipadas: a de "já saiu" e a de "rotina ainda
   * rodando". A segunda também, senão de manhã o forçar não faria nada — e o
   * assunto já avisa quando o retrato é parcial.
   */
  const forcar = new URL(req.url).searchParams.get("forcar") === "1"

  return registrarCron("saude-diaria", async () => {
    /**
     * ESPERA A ROTINA DO DIA FECHAR — mas nunca deixa de falar.
     *
     * O relatório saía às 11h em ponto, e a rotina não termina em horário
     * fixo: os extratos do iFood são assíncronos e, em 15/08/26, só ficaram
     * prontos ao longo da tarde. O e-mail das 11h dizia "fechou em 70/86
     * lojas" e listava lojas saudáveis como atrasadas.
     *
     * Agora o cron roda de hora em hora e só ENVIA quando a fila zera. Se não
     * zerar — às vezes não zera, porque depende da fila deles —, ele manda na
     * última janela do dia dizendo que saiu incompleto. As duas checagens
     * abaixo são baratas de propósito: nas janelas em que não vai enviar, o
     * cron sai antes de montar o diagnóstico inteiro.
     */
    if (!forcar && (await saudeJaSaiuHoje())) {
      return Response.json({ ok: true, pulou: "já saiu hoje" })
    }
    const estado = await estadoDoPipeline()
    // Última janela (20h de Brasília = 23h UTC): manda do jeito que estiver.
    const ultimaJanela = new Date().getUTCHours() >= 23
    if (!forcar && !estado.concluido && !ultimaJanela) {
      return Response.json({
        ok: true,
        pulou: "rotina do dia ainda rodando",
        faltamExtrato: estado.faltamExtrato,
        faltamBackfill: estado.faltamBackfill,
        bloqueadas: estado.bloqueadas.length,
      })
    }

    const s = await diagnosticarIntegracoes()

    // Conferência API × planilha do mês corrente. Nunca derruba o relatório de
    // saúde: se ela falhar, o e-mail sai sem a seção — silêncio no diagnóstico
    // inteiro seria pior que a ausência de um bloco.
    const agora = new Date()
    let conferencia: ConferenciaResumo[] = []
    try {
      const linhas = await conferirFontes(
        agora.getFullYear(),
        agora.getMonth() + 1,
      )
      conferencia = linhas
        // Só o MIOLO do mês. Faltante na borda é pedido da virada, com o
        // evento financeiro na competência vizinha — em julho/26 isso era
        // 100% dos faltantes, e alarmar por ele seria ruído puro.
        .filter((l) => l.soApiMiolo > 0 || l.soPlanilhaMiolo > 0)
        .slice(0, 25)
        .map((l) => ({
          clienteNome: l.clienteNome,
          unitCode: l.unitCode,
          unitName: l.unitName,
          plataforma: "iFood",
          pedidosApi: l.pedidosApi,
          pedidosPlanilha: l.pedidosPlanilha,
          provavelMotivo: l.provavelMotivo,
        }))
    } catch (e) {
      console.error("saude-diaria: conferência de fontes falhou:", e)
    }

    // Volume que as rotinas trouxeram. Mesmo tratamento da conferência: se
    // falhar, o e-mail sai sem o bloco em vez de não sair.
    let rodada: RodadaDiaria | undefined
    try {
      rodada = await resumoDaRodada()
    } catch (e) {
      console.error("saude-diaria: resumo da rodada falhou:", e)
    }

    // Uma linha por LOJA (não por loja × plataforma), separando o que parou
    // hoje do que já estava parado. É o que segura o tamanho do e-mail quando
    // a base crescer: com 75 lojas já seriam 158 linhas.
    const g = agruparSaude(s.lojas)

    // Peso do banco/storage. Nunca derruba o relatório: um erro aqui tira o
    // bloco, não o e-mail.
    let infra: InfraMetricas | null = null
    try {
      infra = await medirInfra()
    } catch (e) {
      console.error("medirInfra:", e)
    }

    const msg = emailSaude(s, conferencia, rodada, g, infra)

    // Quem lê precisa saber que está vendo um retrato parcial — senão vai
    // tratar "faltam 12 lojas" como problema, quando é só a fila do iFood
    // ainda rodando.
    // ⚠️ Loja BLOQUEADA entra no assunto, não some.
    //
    // Ela deixou de segurar o envio (ver pipeline-do-dia.ts), e o risco de
    // parar de segurar é parar de aparecer — trocar um relatório atrasado por
    // um relatório pontual que esconde o problema seria piorar disfarçando.
    // O corpo já lista a loja em "parou de mandar dado"; o assunto diz que a
    // causa é permissão, que é o que muda a ação de quem lê.
    const bloqueio =
      estado.bloqueadas.length > 0
        ? ` · ${estado.bloqueadas.length} loja(s) sem permissão no iFood`
        : ""
    const assunto = estado.concluido
      ? `${msg.assunto}${bloqueio}`
      : `${msg.assunto} (parcial — ${estado.faltamExtrato} loja(s) sem extrato ainda)${bloqueio}`

    // holdingId null + forcar: este e-mail não pertence a cliente nenhum e
    // precisa sair TODO dia — a trava de "já enviei este tipo" mataria o
    // segundo envio pra sempre.
    const envio = await enviarEmail({
      holdingId: null,
      tipo: "saude-diaria",
      para: DESTINO,
      assunto,
      html: msg.html,
      forcar: true,
    })

    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      assunto,
      completo: estado.concluido,
      // Sai na resposta pra conferir sem abrir o e-mail.
      lojasSumidas: s.lojasSumidas.map(
        (m) => `${m.empresa}/${m.unitName} (${m.dias}d)`,
      ),
      bloqueadas: estado.bloqueadas.length,
      email: envio.ok ? "enviado" : `falhou: ${envio.erro}`,
      resumo: s.resumo,
      conferencia: conferencia.length,
      rodada: rodada
        ? {
            linhas: rodada.totalLinhas,
            lojas: rodada.totalLojas,
            extrato: `${rodada.extrato.fecharamHoje}/${rodada.extrato.conectadas}`,
            gravidade: rodada.gravidade,
          }
        : "falhou",
      alertas: [
        ...s.lojas.filter((l) => l.gravidade === "alerta").map((l) => `${l.cliente}/${l.loja}: ${l.motivo}`),
        ...s.crons.filter((c) => c.gravidade === "alerta").map((c) => `${c.nome}: ${c.motivo}`),
        ...(rodada?.extrato.atrasadas ?? [])
          .filter((a) => a.gravidade === "alerta")
          .map((a) => `${a.cliente}/${a.loja}: extrato do mês há ${a.dias ?? "?"} dias`),
      ],
    })
  })
}
