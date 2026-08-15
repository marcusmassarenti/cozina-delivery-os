/**
 * Push de "a importação da manhã terminou" — pro superadmin, não pro cliente.
 *
 * O relatório de saúde por e-mail (11h) já conta a mesma história com muito
 * mais detalhe. Este push existe pra outra pergunta, feita cinco horas antes:
 * "posso abrir o painel e confiar no número?". Ele chega às 6h30, logo depois
 * do último sync da manhã, e responde sim ou não.
 *
 * O veredito vem de `cron_runs`, e não de contar linha importada, de
 * propósito: dia sem venda nenhuma numa loja é indistinguível de dia em que o
 * sync não rodou se a gente olhar só o volume. `cron_runs` sabe a diferença
 * entre "rodou e não achou nada" e "não rodou".
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPush } from "@/lib/push/enviar"

/** Os syncs que precisam ter passado antes de o painel estar confiável. */
const SYNCS_DA_MANHA = [
  { nome: "ninefood-sync", rotulo: "99 Food" },
  { nome: "ifood-sync", rotulo: "iFood financeiro" },
  { nome: "cardapioweb-sync", rotulo: "Cardápio Web" },
  { nome: "ifood-review-sync", rotulo: "iFood avaliações" },
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
  titulo: string
  corpo: string
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

  // Janela: do começo do dia em São Paulo até agora. O -03:00 explícito evita
  // o clássico de comparar um timestamptz com uma data solta e pegar o dia
  // errado entre meia-noite e 3h da manhã.
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
    // A execução mais recente do dia é a que vale: rodar de novo na mão
    // depois de uma falha é justamente como se conserta a manhã, e o push
    // tem que refletir o conserto, não a falha já resolvida.
    const r = linhas.find((l) => l.nome === nome)
    return {
      nome,
      rotulo,
      ok: r ? r.ok : null,
      erro: r?.erro ?? null,
      duracaoMs: r?.duracao_ms ?? null,
    }
  })

  // Número de apoio: quantas lojas receberam lançamento do iFood hoje. Não
  // decide o veredito (ver o comentário do topo), mas é o que dá pra conferir
  // de relance contra o que se espera da rede.
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
    // Contagem é enfeite; o push sai sem ela em vez de não sair.
  }

  const falharam = syncs.filter((s) => s.ok === false)
  const naoRodaram = syncs.filter((s) => s.ok === null)
  const passaram = syncs.filter((s) => s.ok === true)

  let titulo: string
  let corpo: string
  if (falharam.length === 0 && naoRodaram.length === 0) {
    titulo = "✅ Importação da manhã concluída"
    corpo = `As 4 rotinas rodaram. ${lojasComDado} ${lojasComDado === 1 ? "loja recebeu" : "lojas receberam"} dado novo do iFood. Pode confiar no painel.`
  } else {
    // Falha e ausência viram o MESMO alerta de propósito: pra quem vai abrir o
    // painel, "rodou e deu erro" e "não rodou" têm a mesma consequência — o
    // número da tela não está fechado.
    const problemas = [...falharam, ...naoRodaram]
    titulo = `⚠️ Importação com ${problemas.length} ${problemas.length === 1 ? "pendência" : "pendências"}`
    const lista = problemas
      .map((s) => `${s.rotulo} (${s.ok === false ? "falhou" : "não rodou"})`)
      .join(", ")
    corpo = `${lista}. ${passaram.length} de 4 ok · ${lojasComDado} lojas com dado novo.`
  }

  // Quem recebe: superadmin. Este push é operação da plataforma, não do
  // negócio do cliente — franqueado não tem o que fazer com "o cron das 6h
  // falhou", e receber isso só ensinaria a ignorar notificação.
  const { data: admins } = await admin
    .from("profiles")
    .select("user_id")
    .eq("is_superadmin", true)

  const userIds = ((admins ?? []) as { user_id: string }[]).map((a) => a.user_id)
  if (userIds.length === 0) {
    return { dia, syncs, lojasComDado, titulo, corpo, enviados: 0, destinatarios: 0 }
  }

  const res = await enviarPush(userIds, {
    titulo,
    corpo,
    url: "/saude",
    // Mesmo `tag` todo dia: o resumo de hoje substitui o de ontem na tela de
    // bloqueio. Empilhar sete "importação concluída" é como não mandar nenhum.
    tag: "resumo-importacao",
  })

  return {
    dia,
    syncs,
    lojasComDado,
    titulo,
    corpo,
    enviados: res.enviados,
    destinatarios: userIds.length,
  }
}
