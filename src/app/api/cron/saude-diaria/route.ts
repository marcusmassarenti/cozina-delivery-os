/**
 * Relatório diário de saúde das integrações.
 *
 * Roda de manhã, diagnostica e manda UM e-mail interno com o veredito no
 * assunto. Não usa a trava de duplicidade da régua de clientes: aqui o certo é
 * mandar todo dia, inclusive em dia verde — silêncio ambíguo ("não recebi
 * nada: está tudo bem ou o relatório parou?") é o modo de falha que este
 * relatório existe pra eliminar.
 *
 * ⏰ 14:00 UTC (11h de Brasília) — DEPOIS de todos os outros crons, que vão
 * até 13:00 UTC. Rodar antes faria o relatório julgar um dia que ainda não
 * aconteceu. 1x/dia porque a conta Vercel é HOBBY, onde cron mais frequente
 * que diário FALHA O DEPLOY — não é aviso, o build quebra.
 */
import { diagnosticarIntegracoes } from "@/lib/data/saude-integracoes"
import { emailSaude, type ConferenciaResumo } from "@/lib/email/saude"
import { conferirFontes } from "@/lib/data/conferencia-fontes"
import { enviarEmail } from "@/lib/email/enviar"
import { registrarCron } from "@/lib/cron/registrar"

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

  return registrarCron("saude-diaria", async () => {
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
        // Só as que têm DIA faltando. Diferença só de valor entra na fase de
        // calibragem depois — começar por ela encheria o e-mail de ruído.
        .filter((l) => l.diasSoNaApi.length > 0 || l.diasSoNaPlanilha.length > 0)
        .slice(0, 25)
        .map((l) => ({
          clienteNome: l.clienteNome,
          unitCode: l.unitCode,
          unitName: l.unitName,
          plataforma: l.plataforma === "ifood" ? "iFood" : "99 Food",
          pedidosApi: l.pedidosApi,
          pedidosPlanilha: l.pedidosPlanilha,
          provavelMotivo: l.provavelMotivo,
        }))
    } catch (e) {
      console.error("saude-diaria: conferência de fontes falhou:", e)
    }

    const msg = emailSaude(s, conferencia)

    // holdingId null + forcar: este e-mail não pertence a cliente nenhum e
    // precisa sair TODO dia — a trava de "já enviei este tipo" mataria o
    // segundo envio pra sempre.
    const envio = await enviarEmail({
      holdingId: null,
      tipo: "saude-diaria",
      para: DESTINO,
      assunto: msg.assunto,
      html: msg.html,
      forcar: true,
    })

    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      assunto: msg.assunto,
      email: envio.ok ? "enviado" : `falhou: ${envio.erro}`,
      resumo: s.resumo,
      conferencia: conferencia.length,
      alertas: [
        ...s.lojas.filter((l) => l.gravidade === "alerta").map((l) => `${l.cliente}/${l.loja}: ${l.motivo}`),
        ...s.crons.filter((c) => c.gravidade === "alerta").map((c) => `${c.nome}: ${c.motivo}`),
      ],
    })
  })
}
