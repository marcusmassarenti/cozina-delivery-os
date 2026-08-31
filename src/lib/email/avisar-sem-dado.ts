import "server-only"

/**
 * Dispara o aviso semanal de "loja sem dado" — um e-mail por cliente afetado.
 *
 * Só sai quando há problema. Cliente com tudo em dia não recebe nada: e-mail
 * semanal de "está tudo bem" ensina a arquivar sem abrir, e aí o dia em que
 * algo quebra é arquivado junto.
 *
 * ⚠️ MODO PRÉVIA (decidido em 08/ago/26): enquanto `AVISO_CLIENTE_LIBERADO`
 * não for "1", TODOS os e-mails vão pro endereço interno com uma tarja dizendo
 * para quem iriam. Ligar isso é trocar uma variável de ambiente — não precisa
 * de deploy, e é reversível na mesma velocidade.
 */
import { diagnosticarIntegracoes } from "@/lib/data/saude-integracoes"
import { contatosPorHolding } from "@/lib/data/contato-cliente"
import { lojasEsperandoCadastro } from "@/lib/data/merchants-esperando"

import {
  emailClienteIntegracao,
  type LojaSumidaAviso,
} from "./cliente-integracao"
import { enviarEmail } from "./enviar"

const INTERNO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"
const LIBERADO = process.env.AVISO_CLIENTE_LIBERADO === "1"

export type ResultadoAviso = {
  liberado: boolean
  clientesComProblema: number
  enviados: number
  falhas: string[]
}

export async function avisarClientesSemDado(): Promise<ResultadoAviso> {
  const s = await diagnosticarIntegracoes()

  /* ── SÓ CONEXÃO ────────────────────────────────────────────────────────
   *
   * Este e-mail já foi "suas lojas pararam de mandar dados", e a prévia de
   * 31/08 mostrou por que isso não podia sair: "os pedidos estão chegando
   * normalmente, mas o faturamento parou em 27/08" é sintoma sem causa, e
   * quem lê conclui — com razão — que o defeito é de quem escreveu. Cobrar o
   * cliente por uma falha que pode ser nossa gasta a confiança que o canal
   * existe pra construir.
   *
   * Ficam aqui as três pendências cuja causa é comprovadamente do lado dele
   * e cuja ação também é dele. "Vendia e parou" e "o financeiro parou antes
   * dos pedidos" seguem no relatório INTERNO, que é onde a gente investiga
   * antes de acusar. */
  const esperandoPorCliente = await lojasEsperandoCadastro()

  const sumidasPorCliente = new Map<string, LojaSumidaAviso[]>()
  for (const l of s.lojasSumidas) {
    const lista = sumidasPorCliente.get(l.empresa) ?? []
    lista.push({ nome: l.unitName, cnpj: l.cnpj, dias: l.dias })
    sumidasPorCliente.set(l.empresa, lista)
  }

  /* Plataforma marcada no cadastro sem integração ligada.
   * Continua sendo CONTEXTO e não gatilho: é estado permanente e ambíguo
   * (pode ser cadastro a mais), e cliente com uma marcação solta receberia a
   * mesma cobrança toda segunda pra sempre. */
  const semConexaoPorCliente = new Map<string, { plataformas: number; lojas: Set<string> }>()
  for (const l of s.lojas) {
    if (l.conectada) continue
    const cur = semConexaoPorCliente.get(l.cliente) ?? {
      plataformas: 0,
      lojas: new Set<string>(),
    }
    cur.plataformas += 1
    cur.lojas.add(l.unitId)
    semConexaoPorCliente.set(l.cliente, cur)
  }

  // Gatilho: só quem tem loja esperando cadastro ou conexão caída.
  const clientes = new Set<string>([
    ...[...esperandoPorCliente].filter(([, l]) => l.length > 0).map(([c]) => c),
    ...[...sumidasPorCliente].filter(([, l]) => l.length > 0).map(([c]) => c),
  ])

  const falhas: string[] = []
  let enviados = 0

  const contatos = await contatosPorHolding()
  const porNome = new Map([...contatos.values()].map((c) => [c.nomeCliente, c]))

  for (const cliente of clientes) {
    const contato = porNome.get(cliente)
    const holdingId = contato?.holdingId ?? null
    const destinoReal = contato?.email ?? null

    // Em prévia, tudo vai pro interno. Liberado, vai pro admin do cliente — e
    // se ele não tiver e-mail, cai no interno em vez de sumir em silêncio.
    const para = LIBERADO ? (destinoReal ?? INTERNO) : INTERNO
    const previaPara = LIBERADO ? undefined : (destinoReal ?? `${cliente} (sem admin cadastrado)`)

    const sc = semConexaoPorCliente.get(cliente)
    const msg = emailClienteIntegracao(
      cliente,
      previaPara,
      esperandoPorCliente.get(cliente) ?? [],
      sumidasPorCliente.get(cliente) ?? [],
      sc ? { plataformas: sc.plataformas, lojas: sc.lojas.size } : null,
    )

    const r = await enviarEmail({
      holdingId,
      tipo: "loja-sem-dado",
      para,
      assunto: previaPara ? `[prévia · ${cliente}] ${msg.assunto}` : msg.assunto,
      html: msg.html,
      // `forcar` porque isto NÃO é régua de uma vez só: a mesma conexão pode
      // cair em semanas diferentes, e a trava de duplicidade engoliria da
      // segunda em diante — exatamente quando o problema virou recorrente.
      forcar: true,
    })
    if (r.ok) enviados += 1
    else falhas.push(`${cliente}: ${r.erro ?? "erro"}`)
  }

  return {
    liberado: LIBERADO,
    clientesComProblema: clientes.size,
    enviados,
    falhas,
  }
}
