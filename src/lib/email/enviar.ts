/**
 * Envio de e-mail transacional pela API do Resend.
 *
 * `fetch` direto em vez do SDK: a API é um POST só, e uma dependência a menos
 * é uma coisa a menos pra quebrar no build da Vercel.
 *
 * Sem RESEND_API_KEY o envio vira no-op registrado — o sistema continua
 * funcionando e o log mostra que ficou pendente. Nunca lança: e-mail que
 * derruba um cron de cobrança é pior que e-mail não enviado.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Remetente e resposta no mesmo endereço: é onde o Marcus responde. */
const FROM = process.env.EMAIL_FROM ?? "DeliveryOS <suporte@deliveryos.food>"
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "suporte@deliveryos.food"

export type TipoEmail =
  | "confirme-1"
  | "confirme-2"
  | "confirme-3"
  | "boas-vindas"
  | "trial-3-dias"
  | "trial-terminou"
  | "recuperacao-1"
  | "recuperacao-2"
  | "recuperacao-3"
  | "recuperacao-4"
  | "fatura-vencendo"
  | "fatura-vencida"
  /** Relatório interno de saúde — sai todo dia, não é régua de cliente. */
  | "saude-diaria"
  /**
   * Conexão iFood recusada. NÃO é régua: pode acontecer várias vezes pro mesmo
   * cliente (uma por CNPJ errado), então quem dispara manda `forcar: true` —
   * senão a trava de duplicidade engoliria da segunda recusa em diante.
   */
  | "conexao-recusada"
  /**
   * "Pedi a conexão no iFood, falta você aprovar no Portal do Parceiro".
   * Também vai com `forcar: true`: um cliente tem várias lojas e cada uma tem
   * a sua solicitação — sem forçar, o segundo CNPJ seria engolido como
   * repetido e o dono nunca saberia que tem outra loja esperando.
   */
  | "conexao-solicitada"
  /**
   * "Conectado — olha o que já entrou", com o primeiro resultado. Uma vez por
   * loja × plataforma (o carimbo mora em unit_platforms.email_conectado_at).
   * `forcar: true` porque um cliente com 16 lojas conectando no mesmo dia
   * dispara 16 e-mails legítimos.
   */
  | "conexao-ativada"
  /**
   * Recuperação de senha. Sai pelo nosso layout em vez do template do
   * Supabase — ver a nota em templates.ts. `forcar: true` porque a pessoa pode
   * pedir de novo se o link expirar, e recusar o segundo pedido a deixaria
   * trancada do lado de fora.
   */
  | "recuperar-senha"
  /**
   * Manutenção programada da plataforma (iFood, 13/ago/26). A DATA faz parte
   * do tipo de propósito: a trava é por tipo × cliente, e um tipo genérico
   * "manutencao" bloquearia o aviso da PRÓXIMA manutenção pra sempre.
   */
  | "manutencao-ifood-2026-08-13"
  /**
   * Cobrança a vencer — três toques por CICLO: 5 dias, 2 dias e no dia.
   *
   * A data do vencimento faz parte do tipo porque a trava de duplicidade é
   * `(holding_id, tipo)` SEM data. Com um tipo fixo, o lembrete sairia uma vez
   * na vida do cliente e nunca mais — que é o que acontecia com
   * "fatura-vencendo": mensalidade é mensal, o aviso não era.
   */
  | `fatura-5-dias-${string}`
  | `fatura-2-dias-${string}`
  | `fatura-vence-hoje-${string}`
  /**
   * Aviso semanal ao cliente de que uma loja parou de mandar dado. Também NÃO
   * é régua: a mesma loja pode parar em semanas diferentes, então quem dispara
   * manda `forcar: true` — senão a trava engoliria a segunda vez em diante,
   * que é justamente quando o problema virou recorrente.
   */
  | "loja-sem-dado"
  /**
   * Campanha avulsa de novidades (ago/26). Sem `forcar`: a trava de
   * duplicidade é justamente o que garante um por cliente, mesmo se o disparo
   * for repetido por engano.
   */
  | "novidades-ago26"
  /**
   * "Uma loja foi compartilhada com você." Um por cliente que recebe — a trava
   * de duplicidade é o que impede o cron de repetir todo dia.
   */
  | "loja-compartilhada"
  /**
   * Fechamento do mês com dias faltando. Mensal, então quem dispara manda
   * `forcar: true` e faz a própria trava por janela de dias — a trava padrão
   * é "uma vez e nunca mais", que aqui significaria avisar só no primeiro mês.
   */
  | "fechamento-mes"
  /** Loja nova conectou no Cardápio Web — interno, um por instalação. */
  | "cardapioweb-instalacao"
  /**
   * Cliente PEDIU a conexão do iFood (fila de ativação). Interno. Como o
   * mesmo cliente pede uma vez por loja, quem dispara manda `forcar: true`:
   * a trava padrão avisaria só da primeira loja e engoliria as outras seis.
   */
  | "ifood-solicitacao"
  /**
   * Cliente CONFIRMOU que aprovou a conexão no Portal do Parceiro dele — é o
   * sinal de "agora é a nossa vez de vincular". Mesmo raciocínio: `forcar`.
   */
  | "ifood-aprovacao-confirmada"
  /** Cliente pediu a conexão do 99 Food. Interno, um por loja — `forcar`. */
  | "ninefood-solicitacao"
  /**
   * "Pedimos a conexão e nada chegou — você aprovou?" Cobra do cliente a
   * confirmação quando a loja fica dias solicitada sem trazer dado.
   *
   * Vai com `forcar: true` e a trava REAL não é esta: é a coluna
   * `ifood_activation_requests.cobranca_enviada_em`, marcada por LOJA. Tinha
   * que ser assim porque o e-mail é um só por cliente, listando as lojas dele
   * — com a trava padrão `(holding_id, tipo)`, um cliente com três lojas
   * paradas seria avisado de uma e nunca das outras duas. Foi exatamente esse
   * o caso que criou este e-mail (Tech Assessoria, ago/26).
   *
   * O sufixo do tipo é o id do cliente, só pra o registro em `email_enviados`
   * dizer de quem era o envio.
   */
  | `conexao-sem-dado-${string}`
  /**
   * Chamado do chat de suporte esperando gente. INTERNO e sempre com
   * `forcar: true` — vários chamados por dia são o funcionamento normal, e a
   * trava padrão entregaria o primeiro e engoliria todos os outros.
   *
   * Só sai quando o push NÃO alcançou ninguém: é socorro, não cópia.
   */
  | "suporte-chamado"
  /**
   * "Respondemos seu chamado." Mesmo raciocínio, do outro lado: um cliente
   * abre vários chamados ao longo do tempo e cada um merece a sua resposta.
   */
  | "suporte-resposta"
  /**
   * Comprovante do aceite eletrônico da proposta — vai pra quem aceitou e uma
   * cópia interna. `forcar: true` sempre: o mesmo cliente pode aceitar outra
   * proposta depois (renovação, troca de plano), e a trava de duplicidade
   * engoliria o comprovante da segunda.
   */
  | "proposta-aceita"

export type ResultadoEnvio = {
  ok: boolean
  id?: string
  erro?: string
  /** Não enviou porque já tinha sido enviado antes. */
  jaEnviado?: boolean
}

/**
 * Manda um e-mail e registra. Se já existir envio bem-sucedido deste tipo pra
 * este cliente, NÃO manda de novo — é o que impede a régua de repetir quando o
 * cron roda todo dia.
 */
export async function enviarEmail(input: {
  holdingId: string | null
  tipo: TipoEmail
  para: string
  assunto: string
  html: string
  /** Ignora a trava de duplicidade (só pra teste manual). */
  forcar?: boolean
}): Promise<ResultadoEnvio> {
  const admin = createAdminClient()

  if (!input.forcar && input.holdingId) {
    const { data: ja } = await admin
      .from("email_enviados")
      .select("id")
      .eq("holding_id", input.holdingId)
      .eq("tipo", input.tipo)
      .is("erro", null)
      .maybeSingle()
    if (ja) return { ok: true, jaEnviado: true }
  }

  const chave = process.env.RESEND_API_KEY
  if (!chave) {
    // Sem chave o sistema segue: registra a intenção pra ficar visível que a
    // régua está montada mas não sai do lugar.
    await admin.from("email_enviados").insert({
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      erro: "RESEND_API_KEY ausente",
    })
    return { ok: false, erro: "RESEND_API_KEY ausente" }
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [input.para],
        reply_to: REPLY_TO,
        subject: input.assunto,
        html: input.html,
      }),
    })
    const body = (await r.json().catch(() => ({}))) as {
      id?: string
      message?: string
      name?: string
    }

    if (!r.ok) {
      const erro = body.message ?? `HTTP ${r.status}`
      await admin.from("email_enviados").insert({
        holding_id: input.holdingId,
        tipo: input.tipo,
        destinatario: input.para,
        erro,
      })
      return { ok: false, erro }
    }

    await admin.from("email_enviados").insert({
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      resend_id: body.id ?? null,
    })
    return { ok: true, id: body.id }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    await admin.from("email_enviados").insert({
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      erro,
    })
    return { ok: false, erro }
  }
}
