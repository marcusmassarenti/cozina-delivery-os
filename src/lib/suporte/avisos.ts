import "server-only"

/**
 * Avisos do chat de suporte — os dois sentidos.
 *
 * O chat só substitui o WhatsApp se a mensagem ALCANÇAR a pessoa com o sistema
 * fechado. Sem isto, os dois lados precisam manter uma aba aberta pra descobrir
 * que o outro respondeu, e o WhatsApp volta a ser o caminho mais curto.
 *
 * Três regras seguram o barulho, que é o que mata notificação:
 *
 *  1. A EQUIPE só é avisada quando o chamado precisa de gente — escalou, ou já
 *     está com humano e o cliente respondeu. Enquanto a IA resolve sozinha,
 *     silêncio. Avisar de tudo que a IA já respondeu treina a ignorar o aviso.
 *  2. E-mail é o SOCORRO do push, não a cópia dele. Só sai quando nenhum
 *     dispositivo recebeu — quem já viu no celular não precisa da caixa de
 *     entrada dizendo a mesma coisa.
 *  3. Quem leu a conversa há menos de um minuto está OLHANDO pra ela. As duas
 *     telas se atualizam sozinhas; avisar nessa janela é vibrar o celular de
 *     alguém que está lendo a frase na tela.
 *
 * Nada aqui lança. Aviso que derruba o envio da mensagem inverte a prioridade:
 * a mensagem gravada é o que importa, o aviso é o acessório.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"
import { enviarEmail } from "@/lib/email/enviar"
import { montarAvisoConexao, linhaAviso } from "@/lib/email/aviso-conexao"

/** Janela em que consideramos que a pessoa está com a conversa aberta. */
const OLHANDO_MS = 60_000

/** Recorta a mensagem pro corpo da notificação sem cortar no meio da palavra. */
function resumo(texto: string, limite = 120): string {
  const t = texto.replace(/\s+/g, " ").trim()
  if (t.length <= limite) return t
  const corte = t.slice(0, limite)
  const espaco = corte.lastIndexOf(" ")
  return `${espaco > 40 ? corte.slice(0, espaco) : corte}…`
}

function estaOlhando(lidaEm: string | null | undefined): boolean {
  if (!lidaEm) return false
  return Date.now() - Date.parse(lidaEm) < OLHANDO_MS
}

async function emailDoUsuario(userId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId)
    return data.user?.email ?? null
  } catch (e) {
    console.error("suporte/avisos: getUserById", e)
    return null
  }
}

/**
 * Cliente escreveu e o chamado precisa de gente. Avisa quem é da plataforma.
 *
 * `escalouAgora` separa os dois motivos porque o texto muda: "chamado novo na
 * fila" e "o cliente respondeu" pedem urgências diferentes de quem lê.
 */
export async function avisarEquipe(input: {
  conversaId: string
  holdingId: string
  texto: string
  escalouAgora: boolean
  /**
   * `lida_equipe_em` de ANTES de gravar a mensagem do cliente.
   *
   * Precisa vir de fora porque gravar a mensagem zera esse campo (é o que
   * acende a bolinha de "não lida" na fila). Se lêssemos aqui, ele já estaria
   * nulo e a regra do "está olhando pra conversa" nunca valeria.
   */
  lidaEquipeEm: string | null
}): Promise<void> {
  try {
    if (estaOlhando(input.lidaEquipeEm)) return
    const admin = createAdminClient()

    const [{ data: h }, { data: equipe }] = await Promise.all([
      admin.from("holdings").select("name").eq("id", input.holdingId).maybeSingle(),
      admin.from("profiles").select("user_id").eq("is_superadmin", true),
    ])

    const ids = ((equipe ?? []) as { user_id: string }[]).map((p) => p.user_id)
    if (ids.length === 0) return

    const empresa = (h as { name: string } | null)?.name ?? "Um cliente"
    const titulo = input.escalouAgora
      ? `${empresa} pediu atendimento`
      : `${empresa} respondeu`

    const r = await enviarPush(ids, {
      titulo,
      corpo: resumo(input.texto),
      url: "/suporte",
      // Mesma conversa substitui o aviso anterior: cinco mensagens seguidas do
      // mesmo cliente são um assunto só, não cinco notificações.
      tag: `suporte-${input.conversaId}`,
    })
    if (r.enviados > 0) return

    // Nenhum aparelho recebeu (sem assinatura, sem VAPID, tudo revogado). Aí
    // sim o e-mail — senão o chamado fica esperando alguém abrir o painel por
    // acaso.
    const para = process.env.SUPORTE_EMAIL ?? process.env.EMAIL_REPLY_TO
    if (!para) return
    await enviarEmail({
      holdingId: null,
      tipo: "suporte-chamado",
      para,
      assunto: `[Suporte] ${titulo}`,
      html: montarAvisoConexao({
        plataforma: "Suporte",
        titulo,
        linhas:
          linhaAviso("Cliente", empresa) +
          linhaAviso("Mensagem", resumo(input.texto, 400)),
        proximoPasso: input.escalouAgora
          ? "A IA não resolveu e passou pra você. O raio-x da conta já está na tela."
          : "O chamado está com você e o cliente respondeu.",
        acaoHref: "/suporte",
        acaoTexto: "Responder no painel →",
      }),
      // Vários chamados por dia são legítimos: sem forçar, a trava de
      // duplicidade entregaria o primeiro e engoliria todos os outros.
      forcar: true,
    })
  } catch (e) {
    console.error("suporte/avisos: avisarEquipe", e)
  }
}

/**
 * A equipe respondeu. Avisa quem abriu o chamado — não a empresa inteira:
 * quem perguntou é uma pessoa, e o resto da equipe do cliente não pediu nada.
 */
export async function avisarCliente(input: {
  conversaId: string
  holdingId: string
  texto: string
  abertaPor: string | null
  /**
   * `lida_cliente_em` de ANTES de gravar a resposta — gravar zera esse campo.
   * Vale sobretudo no caso mais comum: o cliente perguntou há dez segundos e
   * está com o chat aberto esperando. Vibrar o celular dele ali é ruído.
   */
  lidaClienteEm: string | null
}): Promise<void> {
  try {
    if (!input.abertaPor) return
    if (estaOlhando(input.lidaClienteEm)) return

    const r = await enviarPush([input.abertaPor], {
      titulo: "Delivery OS respondeu",
      corpo: resumo(input.texto),
      url: "/inicio?suporte=1",
      tag: `suporte-${input.conversaId}`,
    })
    if (r.enviados > 0) return

    const para = await emailDoUsuario(input.abertaPor)
    if (!para) return
    await enviarEmail({
      holdingId: input.holdingId,
      tipo: "suporte-resposta",
      para,
      assunto: "Respondemos seu chamado no Delivery OS",
      html: montarAvisoConexao({
        plataforma: "Suporte",
        titulo: "Respondemos você",
        linhas: linhaAviso("Resposta", resumo(input.texto, 400)),
        proximoPasso:
          "É só abrir o sistema e clicar no balão de suporte — a conversa continua de onde parou.",
        acaoHref: "/inicio?suporte=1",
        acaoTexto: "Abrir a conversa →",
      }),
      // Um cliente pode abrir vários chamados ao longo do tempo, e cada um
      // merece a sua resposta. A trava padrão avisaria só do primeiro.
      forcar: true,
    })
  } catch (e) {
    console.error("suporte/avisos: avisarCliente", e)
  }
}
