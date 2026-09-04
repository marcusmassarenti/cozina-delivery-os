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
   * Interno: "uma loja autorizou o app no 99". Disparado pela varredura diária
   * quando aparece vínculo novo. O 99 não tem callback de autorização como o
   * Cardápio Web — sem este aviso, o Marcus só descobria loja nova olhando à
   * mão (foi o caso da Marmitex Faisão, 24/08/26).
   *
   * `holdingId` vai null de propósito: é e-mail da casa, não régua de cliente.
   * A trava de duplicidade não se aplica, e não faz falta — o gatilho é o
   * INSERT do vínculo, que acontece uma vez só por loja.
   */
  | "99-autorizada"
  /**
   * "Este cliente concluiu a parte dele na esteira de conexão." Interno, com
   * `forcar: true`: uma loja gera vários avisos conforme o cliente vai
   * concluindo cada plataforma, e a trava de duplicidade engoliria do segundo
   * passo em diante — justo quando o quadro fica completo.
   */
  | "onboarding-conexao"
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
  | "conexao-solicitada-99"
  /** Resumo interno de cadastro em lote — N lojas pedindo conexão de uma vez. */
  | "conexao-lote"
  /** "Não achei sua loja no portal do iFood" — pendência que só o cliente resolve. */
  | "ifood-nao-encontrada"
  /** Versões em lote: N lojas num e-mail só, em vez de N e-mails iguais. */
  | "conexao-solicitada-lote"
  | "ifood-nao-encontrada-lote"
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
   * Cliente novo entrou pelo self-service. Interno, com `forcar: true`: são
   * vários cadastros por semana e a trava é por (holding, tipo) — como cada
   * cadastro cria uma holding nova ela nem morderia, mas forçar deixa claro
   * que repetição aqui é esperada, não acidente.
   */
  | "cliente-novo"
  /**
   * Acesso cortado por falta de pagamento. A DATA da suspensão faz parte do
   * tipo pelo mesmo motivo das faturas: um cliente pode ser suspenso, voltar e
   * cair de novo meses depois, e com tipo fixo o segundo corte seria silencioso.
   */
  | `conta-suspensa-${string}`
  | `cliente-suspenso-interno-${string}`
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
   * Backfill de comandas do 99 terminou de drenar a fila. INTERNO, sem
   * cliente — e por isso a trava de duplicidade daqui NÃO o protege: ela só
   * roda quando existe `holding_id`. Quem garante o "uma vez só" é a própria
   * rota do cron, que confere `email_enviados` antes de mandar.
   */
  | "ninefood-comandas-fim"
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
  /**
   * O e-mail saiu mas NÃO foi registrado no log.
   *
   * Sobe até a tela de propósito: sem a linha em `email_enviados` a trava de
   * duplicidade não segura o próximo envio, então quem clicou precisa saber
   * que o cliente pode receber de novo.
   */
  logErro?: string
}

/**
 * Grava no log de envios — e RECLAMA quando não consegue.
 *
 * ⚠️ ESTE INSERT NÃO PODE FALHAR CALADO. Descoberto em 19/08/26: cinco e-mails
 * "Falta você aprovar no iFood" e dois do 99 foram ENTREGUES pelo Resend e não
 * deixaram uma linha aqui. A tela dizia "Avisei fulano por e-mail" e o log
 * dizia que nada tinha saído.
 *
 * O estrago não é só o relatório errado: `email_enviados` é a trava de
 * duplicidade. Log que não grava faz a régua achar que nunca mandou — e o
 * cliente recebe o mesmo e-mail de novo, todo dia, até alguém reparar.
 */
async function registrar(
  admin: ReturnType<typeof createAdminClient>,
  linha: {
    holding_id: string | null
    tipo: TipoEmail
    destinatario: string
    resend_id?: string | null
    erro?: string | null
    forcado: boolean
  },
): Promise<string | undefined> {
  const { error } = await admin.from("email_enviados").insert(linha)
  if (!error) return undefined
  console.error(
    `[email] NÃO REGISTREI o envio (${linha.tipo} → ${linha.destinatario}): ${error.message}. ` +
      "O e-mail pode ter saído mesmo assim — e sem esta linha a trava de duplicidade não segura o próximo.",
  )
  return error.message
}

/**
 * Manda um e-mail e registra. Se já existir envio bem-sucedido deste tipo pra
 * este cliente, NÃO manda de novo — é o que impede a régua de repetir quando o
 * cron roda todo dia.
 */
/**
 * O que AINDA sai pra cliente que não é mais operação viva.
 *
 * ── POR QUE ESTA LISTA EXISTE (Marcus, 04/09/26) ─────────────────────────
 * "vbfood e clientes nesse estado não tem mais nenhum tipo de vínculo
 * conosco". Ele disse isso vendo a Vbfood — trial vencido em 14/08, suspensa
 * em 22/08 — receber "sua loja conectou". Medido no mesmo minuto: 14 e-mails
 * em 30 dias pra ela e 8 pra Empreender com Delivery, também suspensa.
 *
 * A causa não foi um aviso mal feito: era que NENHUM caminho de e-mail
 * perguntava se o cliente ainda existe. O helper `clientesForaDaOperacao`
 * estava pronto desde 20/08 e era usado só em três TELAS.
 *
 * Por isso a trava mora aqui, na porta única de saída, e não em cada
 * remetente: régua espalhada por 15 arquivos volta a falhar na primeira cópia
 * nova — que é o modo de falha mais comum deste repositório.
 *
 * ── O QUE CONTINUA SAINDO, E POR QUÊ ─────────────────────────────────────
 * Cobrança e retomada de relação. Um cliente suspenso PRECISA receber
 * "sua fatura venceu" e "bem-vindo de volta" — é assim que ele volta. Cortar
 * isso transformaria uma suspensão temporária em perda definitiva.
 *
 * O que NÃO sai é o operacional: conexão de loja, resumo, novidades, aviso de
 * dado faltando. Isso é serviço, e serviço ele não tem mais.
 *
 * Interno (holdingId null) nunca passa por aqui — não tem cliente pra checar.
 */
const SAI_MESMO_FORA_DA_OPERACAO = new Set<TipoEmail>([
  // Cobrança e ciclo de vida da assinatura
  "fatura-vencendo",
  "fatura-vencida",
  "trial-3-dias",
  "trial-terminou",
  "recuperacao-1",
  "recuperacao-2",
  "recuperacao-3",
  "recuperacao-4",
  "proposta-aceita",
  // Volta / acesso: sem isso ele não consegue nem entrar pra retomar
  "boas-vindas",
  "confirme-1",
  "confirme-2",
  "confirme-3",
  "recuperar-senha",
  // Suporte: se ele escreveu, merece resposta mesmo suspenso
  "suporte-chamado",
  "suporte-resposta",
])

export async function enviarEmail(input: {
  holdingId: string | null
  tipo: TipoEmail
  para: string
  assunto: string
  html: string
  /**
   * Ignora a trava de duplicidade — para o que é "um por LOJA", não por
   * cliente (aprovação do iFood/99, loja conectada, comprovante de proposta).
   *
   * ⚠️ ISTO PRECISA CHEGAR AO BANCO. O índice `email_enviados_unico` também
   * trava por (holding, tipo), então até 19/08/26 o forçado enviava e não
   * registrava: o e-mail saía e o log rejeitava calado. A coluna `forcado`
   * tira essas linhas do índice.
   */
  forcar?: boolean
}): Promise<ResultadoEnvio> {
  const admin = createAdminClient()

  /* CLIENTE QUE NÃO É MAIS OPERAÇÃO NÃO RECEBE E-MAIL OPERACIONAL.
   * Ver `SAI_MESMO_FORA_DA_OPERACAO` acima pro porquê e pro que escapa.
   * Falha de leitura não bloqueia ninguém: o helper devolve conjunto vazio,
   * e mandar a mais é recuperável — deixar de mandar cobrança não é. */
  if (input.holdingId && !SAI_MESMO_FORA_DA_OPERACAO.has(input.tipo)) {
    const { clientesForaDaOperacao } = await import(
      "@/lib/data/clientes-fora-da-operacao"
    )
    const fora = await clientesForaDaOperacao()
    if (fora.has(input.holdingId)) {
      // Registra pra ficar VISÍVEL que existia um e-mail e ele foi retido —
      // silêncio total viraria "por que o cliente não recebeu?" sem resposta.
      await registrar(admin, {
        holding_id: input.holdingId,
        tipo: input.tipo,
        destinatario: input.para,
        erro: "retido: cliente fora da operação",
        forcado: input.forcar === true,
      })
      return { ok: true, jaEnviado: true }
    }
  }

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
    await registrar(admin, {
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      erro: "RESEND_API_KEY ausente",
      forcado: input.forcar === true,
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
      await registrar(admin, {
        holding_id: input.holdingId,
        tipo: input.tipo,
        destinatario: input.para,
        erro,
        forcado: input.forcar === true,
      })
      return { ok: false, erro }
    }

    const logErro = await registrar(admin, {
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      resend_id: body.id ?? null,
      forcado: input.forcar === true,
    })
    return { ok: true, id: body.id, logErro }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    await registrar(admin, {
      holding_id: input.holdingId,
      tipo: input.tipo,
      destinatario: input.para,
      erro,
      forcado: input.forcar === true,
    })
    return { ok: false, erro }
  }
}
