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

  // O cliente é avisado do que a operação dele pode resolver: loja que parou
  // de mandar dado. "Nunca conectou" fica de fora — aquilo é fila de conexão,
  // e já tem régua própria; misturar viraria cobrança de coisa que ele talvez
  // nem queira conectar.
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

    const msg = emailClienteIntegracao(
      { ...grupo, lojas: grupo.lojas.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)) },
      previaPara,
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
