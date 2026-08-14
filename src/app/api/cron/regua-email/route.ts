/**
 * Régua de e-mails do ciclo de vida do cliente — uma passada por dia.
 *
 * Sem RESEND_API_KEY o cron roda e registra "pendente" em vez de enviar, então
 * dá pra ver a régua funcionando antes de existir chave. Não falha por isso.
 *
 * A trava contra e-mail repetido é o índice único de email_enviados, não a
 * data — rodar duas vezes no mesmo dia não manda nada duas vezes.
 */
import { avisarLojasCompartilhadas } from "@/lib/email/loja-compartilhada"
import { cobrarConfirmacaoDeConexao } from "@/lib/email/conexao-sem-dado"
import { enviarNovidades } from "@/lib/email/novidades"
import { rodarReguaEmail } from "@/lib/data/regua-email"
import { rodarReguaFechamento } from "@/lib/data/regua-fechamento"
import { registrarCron } from "@/lib/cron/registrar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("regua-email", async () => {

  const r = await rodarReguaEmail()

  // Pega carona neste cron: o plano só permite uma execução por dia e criar
  // outro cron não caberia. A régua de fechamento sai sozinha no dia certo —
  // nos outros dias ela só devolve "não é hoje".
  const fechamento = await rodarReguaFechamento()

  // ⚠️ GANCHO TEMPORÁRIO — campanha de novidades de ago/26.
  //
  // Mora aqui porque a chave do Resend só existe na Vercel: disparo local não
  // sai (a chave do .env.local foi revogada). É o mesmo caminho pelo qual o
  // e-mail de "conectado" da Vbfood saiu — o cron é quem manda, não a máquina.
  //
  // Se desliga sozinho: `enviarEmail` não repete um tipo já enviado com
  // sucesso pro mesmo cliente, então da segunda passada em diante isto vira
  // uma consulta e nada mais.
  //
  // REMOVER depois de confirmar que os 6 clientes receberam.
  // Avisa quem recebeu loja emprestada. Mesma carona e mesmo motivo do bloco
  // acima: a chave do Resend só existe na Vercel. A trava de duplicidade do
  // enviarEmail faz isto virar consulta a partir do segundo dia.
  let compartilhadas: Awaited<
    ReturnType<typeof avisarLojasCompartilhadas>
  > | null = null
  try {
    compartilhadas = await avisarLojasCompartilhadas()
  } catch (e) {
    console.error("avisarLojasCompartilhadas:", e)
  }

  // Loja pedida há dias e sem nenhum dado: pergunta ao cliente se ele chegou
  // a aprovar. Sem isso os dois lados ficam esperando o outro — foi o que
  // aconteceu com a Tech Assessoria em ago/26, e a descoberta só veio porque
  // o Marcus foi olhar por conta própria. A trava é por loja, então isto vira
  // consulta e nada mais depois que o cliente já foi cobrado.
  let semDado: Awaited<ReturnType<typeof cobrarConfirmacaoDeConexao>> | null =
    null
  try {
    semDado = await cobrarConfirmacaoDeConexao()
  } catch (e) {
    console.error("cobrarConfirmacaoDeConexao:", e)
  }

  let novidades: Awaited<ReturnType<typeof enviarNovidades>> | null = null
  try {
    novidades = await enviarNovidades({ confirmar: true })
  } catch (e) {
    console.error("enviarNovidades:", e)
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    temChave: Boolean(process.env.RESEND_API_KEY),
    ...r,
    fechamento,
    novidades,
    compartilhadas,
    semDado,
  })
  })
}
