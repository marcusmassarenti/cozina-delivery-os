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
import { agruparSaude, type GrupoCliente } from "@/lib/data/saude-agrupada"
import { contatosPorHolding } from "@/lib/data/contato-cliente"
import { lojasEsperandoCadastro } from "@/lib/data/merchants-esperando"

import { emailClienteIntegracao } from "./cliente-integracao"
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
  const g = agruparSaude(s.lojas)

  /* "Nunca trouxe dado" entra como CONTEXTO, não como gatilho.
   *
   * Ele conta no e-mail (o Marcus pediu, e é acionável: ou falta puxar a
   * primeira vez, ou o cadastro tem uma plataforma a mais), mas não faz um
   * e-mail existir sozinho. É estado permanente, e a régua da casa é que
   * e-mail é pra coisa que MUDOU — senão o cliente de conta em teste, com uma
   * marcação solta, receberia a mesma cobrança toda segunda pra sempre.
   * Medido em 08/ago: seriam 3 clientes nessa situação, todos com 1 marcação.
   * No painel ele aparece do mesmo jeito, no aviso semanal. */
  const nuncaPorCliente = new Map<string, { semConexao: number; lojas: Set<string>; aguardando: number }>()
  for (const l of s.lojas) {
    if (l.gravidade === "ok" || l.ultimoPedido || l.ultimoFinanceiro) continue
    const cur = nuncaPorCliente.get(l.cliente) ?? {
      semConexao: 0,
      lojas: new Set<string>(),
      aguardando: 0,
    }
    if (l.conectada) cur.aguardando += 1
    else {
      cur.semConexao += 1
      cur.lojas.add(l.unitId)
    }
    nuncaPorCliente.set(l.cliente, cur)
  }

  // O gatilho continua sendo o que a operação dele pode resolver hoje: loja
  // que mandava dado e parou.
  const porCliente = new Map<string, GrupoCliente>()
  for (const grupo of [...g.pararamHoje, ...g.seguemParadas]) {
    const cur = porCliente.get(grupo.cliente)
    if (!cur) {
      porCliente.set(grupo.cliente, { ...grupo, lojas: [...grupo.lojas] })
      continue
    }
    cur.lojas.push(...grupo.lojas)
    cur.piorDias = Math.max(cur.piorDias ?? 0, grupo.piorDias ?? 0)
  }

  /* LOJA ESPERANDO CADASTRO É GATILHO, diferente do "nunca trouxe dado".
   *
   * A distinção é o que o cliente pode FAZER. "Plataforma marcada que nunca
   * trouxe" é estado permanente e ambíguo — pode ser cadastro a mais — então
   * entra como contexto e não faz e-mail existir sozinho. Aqui o lojista já
   * aprovou a conexão no iFood, o dado está liberado do lado de lá, e falta
   * um ato único e claro: cadastrar a unidade. Quatro lojas da DG FOODS
   * estavam assim havia 34, 32, 31 e 27 dias, e o cliente não tinha como
   * saber — a única tela que mostra isso é interna. */
  const esperandoPorCliente = await lojasEsperandoCadastro()
  for (const [cliente, lista] of esperandoPorCliente) {
    if (lista.length === 0 || porCliente.has(cliente)) continue
    // Cliente que só tem esse problema também recebe: grupo sem lojas
    // paradas, para o e-mail sair com o bloco de espera e mais nada.
    porCliente.set(cliente, {
      cliente,
      lojas: [],
      piorDias: null,
    } as unknown as GrupoCliente)
  }

  const falhas: string[] = []
  let enviados = 0

  // O diagnóstico traz o cliente pelo NOME (é o que aparece na tela); o
  // contato é indexado por id. Um mapa nome → contato resolve, e como nome de
  // holding é único no cadastro, não há ambiguidade.
  const contatos = await contatosPorHolding()
  const porNome = new Map([...contatos.values()].map((c) => [c.nomeCliente, c]))

  for (const [cliente, grupo] of porCliente) {
    const contato = porNome.get(cliente)
    const holdingId = contato?.holdingId ?? null
    const destinoReal = contato?.email ?? null

    // Em prévia, tudo vai pro interno. Liberado, vai pro admin do cliente — e
    // se ele não tiver e-mail, cai no interno em vez de sumir em silêncio.
    const para = LIBERADO ? (destinoReal ?? INTERNO) : INTERNO
    const previaPara = LIBERADO ? undefined : (destinoReal ?? `${cliente} (sem admin cadastrado)`)

    // A ordenação e o corte de volume moram no template — aqui só o conteúdo.
    const nunca = nuncaPorCliente.get(cliente)
    const msg = emailClienteIntegracao(
      grupo,
      previaPara,
      nunca
        ? {
            semConexao: nunca.semConexao,
            lojas: nunca.lojas.size,
            aguardando: nunca.aguardando,
          }
        : undefined,
      esperandoPorCliente.get(cliente) ?? [],
    )

    const r = await enviarEmail({
      holdingId,
      tipo: "loja-sem-dado",
      para,
      assunto: previaPara ? `[prévia · ${cliente}] ${msg.assunto}` : msg.assunto,
      html: msg.html,
      // `forcar` porque isto NÃO é régua de uma vez só: a mesma loja pode
      // parar em semanas diferentes, e a trava de duplicidade engoliria da
      // segunda em diante — exatamente quando o problema virou recorrente.
      forcar: true,
    })
    if (r.ok) enviados += 1
    else falhas.push(`${cliente}: ${r.erro ?? "erro"}`)
  }

  return {
    liberado: LIBERADO,
    clientesComProblema: porCliente.size,
    enviados,
    falhas,
  }
}
