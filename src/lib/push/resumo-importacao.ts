/**
 * Vigia do fechamento da manhã. Só fala quando algo deu errado.
 *
 * Cada sync manda o próprio relatório quando termina (ver `relatorio-sync`) —
 * iFood financeiro às 4h, avaliações às 5h, 99 Food às 6h. Este cron, às 6h30,
 * existe pro caso que aqueles três NÃO cobrem: rotina que não rodou não manda
 * nada, e a ausência de push se parece com "estava tudo bem". Ele lê
 * `cron_runs` e transforma esse silêncio em aviso.
 *
 * Por isso é silencioso no dia bom: quatro pushes verdes toda manhã treinam
 * qualquer um a deslizar a notificação sem ler — e aí o dia em que aparece o
 * vermelho passa batido também.
 *
 * O veredito vem de `cron_runs`, e não de contar linha importada, de
 * propósito: dia sem venda nenhuma numa loja é indistinguível de dia em que o
 * sync não rodou se a gente olhar só o volume.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"
import { idsSuperadmin } from "@/lib/push/relatorio-sync"

/** Os syncs que precisam ter passado antes de o painel estar confiável. */
const SYNCS_DA_MANHA = [
  { nome: "ifood-sync", rotulo: "iFood financeiro" },
  { nome: "ifood-review-sync", rotulo: "iFood avaliações" },
  { nome: "ninefood-sync", rotulo: "99 Food" },
  { nome: "cardapioweb-sync", rotulo: "Cardápio Web" },
] as const

export type StatusSync = {
  nome: string
  rotulo: string
  /** null = não rodou hoje; true/false = rodou e terminou assim. */
  ok: boolean | null
  erro: string | null
  duracaoMs: number | null
}

export type ResultadoResumoImportacao = {
  dia: string
  syncs: StatusSync[]
  lojasComDado: number
  /** true = manhã limpa, nenhum push mandado. */
  silencioso: boolean
  titulo: string | null
  corpo: string | null
  enviados: number
  destinatarios: number
}

/** Hoje em São Paulo (YYYY-MM-DD). O servidor roda em UTC. */
function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function enviarResumoImportacao(): Promise<ResultadoResumoImportacao> {
  const admin = createAdminClient()
  const dia = hojeBR()
  // O -03:00 explícito evita o clássico de comparar timestamptz com data solta
  // e pegar o dia errado entre meia-noite e 3h da manhã.
  const desde = `${dia}T00:00:00-03:00`

  const { data: runs } = await admin
    .from("cron_runs")
    .select("nome, ok, erro, duracao_ms, iniciado_em")
    .gte("iniciado_em", desde)
    .order("iniciado_em", { ascending: false })

  const linhas = (runs ?? []) as {
    nome: string
    ok: boolean | null
    erro: string | null
    duracao_ms: number | null
  }[]

  const syncs: StatusSync[] = SYNCS_DA_MANHA.map(({ nome, rotulo }) => {
    // A execução mais recente do dia é a que vale: rodar de novo na mão depois
    // de uma falha é como se conserta a manhã, e o aviso tem que refletir o
    // conserto, não a falha já resolvida.
    const r = linhas.find((l) => l.nome === nome)
    return {
      nome,
      rotulo,
      ok: r ? r.ok : null,
      erro: r?.erro ?? null,
      duracaoMs: r?.duracao_ms ?? null,
    }
  })

  // Número de apoio: quantas lojas receberam lançamento do iFood hoje.
  let lojasComDado = 0
  try {
    const { data } = await admin
      .from("ifood_financeiro_lancamentos")
      .select("unit_id")
      .gte("imported_at", desde)
    lojasComDado = new Set(
      ((data ?? []) as { unit_id: string }[]).map((l) => l.unit_id),
    ).size
  } catch {
    // Contagem é enfeite; o aviso sai sem ela em vez de não sair.
  }

  // Falha e ausência viram o MESMO alerta de propósito: pra quem vai abrir o
  // painel, "rodou e deu erro" e "não rodou" têm a mesma consequência — o
  // número da tela não está fechado.
  const problemas = syncs.filter((s) => s.ok !== true)

  if (problemas.length === 0) {
    return {
      dia,
      syncs,
      lojasComDado,
      silencioso: true,
      titulo: null,
      corpo: null,
      enviados: 0,
      destinatarios: 0,
    }
  }

  const titulo = `⚠️ Importação com ${problemas.length} ${problemas.length === 1 ? "pendência" : "pendências"}`
  const lista = problemas
    .map((s) => `${s.rotulo} (${s.ok === false ? "falhou" : "não rodou"})`)
    .join(", ")
  const corpo = `${lista}. ${syncs.length - problemas.length} de ${syncs.length} ok · ${lojasComDado} lojas com dado novo.`

  const userIds = await idsSuperadmin()
  const res =
    userIds.length > 0
      ? await enviarPush(userIds, {
          titulo,
          corpo,
          url: "/saude",
          // Mesmo `tag` todo dia: o alerta de hoje substitui o de ontem, em vez
          // de empilhar pendências velhas já resolvidas.
          tag: "resumo-importacao",
        })
      : { enviados: 0 }

  return {
    dia,
    syncs,
    lojasComDado,
    silencioso: false,
    titulo,
    corpo,
    enviados: res.enviados,
    destinatarios: userIds.length,
  }
}
