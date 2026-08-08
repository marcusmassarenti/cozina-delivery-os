/**
 * Sincroniza TODAS as integrações por API, de TODOS os clientes.
 *
 * É a versão de dono do botão que existia antes ("Rodar sync agora"), que só
 * cobria o iFood. Com 4 plataformas e vários clientes, rodar uma de cada vez
 * pelo painel de cada empresa não escala — e o cron de madrugada é o único
 * lugar onde as três rodavam juntas.
 *
 * Quem NÃO entra: a Keeta, que não tem API (só planilha).
 *
 * Cada plataforma é isolada: se o 99 cair, iFood e Cardápio Web seguem. Uma
 * integração fora do ar não pode impedir as outras de atualizarem — foi assim
 * que um erro dos Financial Events chegou a parecer que o sync inteiro tinha
 * falhado.
 */
import { NextResponse } from "next/server"

import { isSuperadmin } from "@/lib/auth/permissions"
import { syncIfoodAll } from "@/lib/ifood/sync"
import { syncNinefoodFinanceiro } from "@/lib/ninefood/sync-financeiro"
import { syncNinefoodCardapio } from "@/lib/ninefood/sync-cardapio"
import { sincronizarTodas } from "@/lib/cardapioweb/sync"

export const runtime = "nodejs"
// O iFood sozinho leva minutos com 60+ lojas; somando 99 e Cardápio Web, o
// padrão de 60s estoura e devolve página de erro em vez de JSON.
export const maxDuration = 300

type Bloco = { ok: boolean; resumo: string; erro?: string }

export async function POST() {
  // Ação de DONO: mexe em todos os clientes de uma vez.
  if (!(await isSuperadmin())) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const t0 = Date.now()
  const blocos: Record<string, Bloco> = {}

  const rodar = async (nome: string, fn: () => Promise<string>) => {
    try {
      blocos[nome] = { ok: true, resumo: await fn() }
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      console.error(`[sync-tudo] ${nome}:`, erro)
      blocos[nome] = { ok: false, resumo: "falhou", erro }
    }
  }

  // Em paralelo: são serviços independentes, e em série o tempo total seria a
  // soma — o que estoura o teto de 300s com a base atual.
  await Promise.all([
    rodar("iFood", async () => {
      // `unitIds: null` = todas as lojas da base (é ação de dono).
      const r = await syncIfoodAll({ force: true, unitIds: null })
      const comErro = (r.results ?? []).filter((u) =>
        (u.reconciliation ?? []).some((c) => c.ok === false),
      ).length
      return `${r.unitsProcessed ?? 0} loja(s)${comErro ? `, ${comErro} com erro` : ""}`
    }),
    rodar("99 Food", async () => {
      // O financeiro do 99 exige janela explícita: pego do 1º dia do mês
      // PASSADO até hoje, mesma régua da conciliação do iFood (mês corrente +
      // anterior) — o mês que já virou ainda recebe ajuste do 99.
      const hoje = new Date()
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const ymd = (d: Date) => d.toISOString().slice(0, 10)
      const [fin, card] = await Promise.all([
        syncNinefoodFinanceiro({ startDate: ymd(ini), endDate: ymd(hoje) }),
        syncNinefoodCardapio(),
      ])
      return `financeiro ${fin.results.length} loja(s) · cardápio ${card.results.length} loja(s)`
    }),
    rodar("Cardápio Web", async () => {
      // Teto de tempo abaixo do maxDuration: sem isso o Cardápio Web sozinho
      // pode consumir a janela toda e derrubar o retorno das outras duas.
      const r = await sincronizarTodas({ limiteMs: 3 * 60_000 })
      return `${r.length} instalação(ões)`
    }),
  ])

  const tudoOk = Object.values(blocos).every((b) => b.ok)
  return NextResponse.json({
    ok: tudoOk,
    ranAt: new Date().toISOString(),
    duracaoSeg: Math.round((Date.now() - t0) / 1000),
    blocos,
  })
}
