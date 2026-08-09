/**
 * Puxa o histórico do iFood desde janeiro/2026 das lojas que estão na fila.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/backfill-historico-ifood.ts "<cliente>" [--aplicar]
 *
 * A fila é `unit_platforms.historico_backfill_at is null` — o mesmo estado que
 * o cron de 15 min consome. Rodar aqui é só antecipar: o cron faria sozinho,
 * 2 lojas por rodada.
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { syncIfoodAll } from "../src/lib/ifood/sync"
import { competenciasDesdeInicio } from "../src/lib/ifood/auto-link"
import { enviarPush } from "../src/lib/push/enviar"

const cliente = process.argv[2]
const aplicar = process.argv.includes("--aplicar")

/** Push de acompanhamento a cada N lojas. 0 = não avisa. */
const AVISAR_A_CADA = Number(
  process.argv.find((a) => a.startsWith("--avisar-a-cada="))?.split("=")[1] ?? 0,
)
/** Pra quem vai o acompanhamento (e-mail do Delivery OS). */
const AVISAR_EMAIL = process.argv
  .find((a) => a.startsWith("--avisar="))
  ?.split("=")[1]

async function main() {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from("unit_platforms")
    .select("unit_id, units(name, active, brands(holdings(name)))")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
    .is("historico_backfill_at", null)

  type R = {
    unit_id: string
    units: { name: string; active: boolean; brands: { holdings: { name: string } | null } | null } | null
  }
  const fila = ((rows ?? []) as unknown as R[])
    .filter((r) => r.units?.active)
    .filter((r) => !cliente || r.units?.brands?.holdings?.name === cliente)

  console.log(`${fila.length} loja(s) na fila${cliente ? ` de ${cliente}` : ""}`)
  for (const r of fila) console.log("  ·", r.units?.name)
  if (!aplicar) return console.log("\n(simulação — rode com --aplicar)")

  const comps = competenciasDesdeInicio()
  console.log(`\ncompetências: ${comps[0]} → ${comps[comps.length - 1]}\n`)

  // Destinatário do acompanhamento, resolvido UMA vez: dentro do laço seriam
  // 40 listagens de usuário pra sempre a mesma resposta.
  let avisarUserId: string | null = null
  if (AVISAR_A_CADA > 0 && AVISAR_EMAIL) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    avisarUserId = (data?.users ?? []).find((x) => x.email === AVISAR_EMAIL)?.id ?? null
    if (!avisarUserId) console.log(`⚠️  ${AVISAR_EMAIL} não encontrado — sem acompanhamento.`)
  }

  let feitas = 0
  let comHistoricoNovo = 0
  let linhasTotal = 0
  const t0Geral = Date.now()

  for (const r of fila) {
    const t0 = Date.now()
    try {
      const res = await syncIfoodAll({ unitIds: [r.unit_id], competences: comps, force: true })
      const u = res.results[0]
      const linhas = (u?.reconciliation ?? []).reduce((s, x) => s + (x.persisted ?? 0), 0)
      const meses = (u?.reconciliation ?? []).filter((x) => (x.persisted ?? 0) > 0).length
      // Sinal = "a API respondeu", não "achou dado" — ver a nota em
      // auto-link.ts. Loja que abriu depois de janeiro volta vazia e mesmo
      // assim sai da fila: a pergunta foi feita e respondida.
      const respondeu = (u?.reconciliation ?? []).some((x) => x.ok === true)
      if (respondeu) {
        await admin.from("unit_platforms")
          .update({ historico_backfill_at: new Date().toISOString() })
          .eq("unit_id", r.unit_id).eq("platform", "ifood")
      }
      console.log(`✓ ${r.units?.name}: ${meses} meses, ${linhas} linhas (${((Date.now()-t0)/1000).toFixed(0)}s)`)
      if (meses > 0) comHistoricoNovo++
      linhasTotal += linhas
    } catch (e) {
      console.log(`✗ ${r.units?.name}: ${e instanceof Error ? e.message : e}`)
    }

    // Acompanhamento a cada N lojas. Vai DEPOIS do try/catch: loja que falhou
    // também andou na fila, e esconder isso faria a contagem do aviso não
    // bater com a da tela.
    feitas++
    if (avisarUserId && AVISAR_A_CADA > 0 && feitas % AVISAR_A_CADA === 0) {
      const min = Math.round((Date.now() - t0Geral) / 60000)
      const faltam = fila.length - feitas
      await enviarPush([avisarUserId], {
        titulo: `Histórico iFood · ${feitas}/${fila.length}`,
        corpo:
          `${cliente ?? "Todos"}: ${feitas} lojas prontas, ${faltam} restando. ` +
          `${comHistoricoNovo} ganharam meses novos (${linhasTotal.toLocaleString("pt-BR")} linhas). ` +
          `${min} min até aqui.`,
        url: "/inicio",
        // Mesma tag: o aviso novo SUBSTITUI o anterior na bandeja em vez de
        // empilhar 4 notificações quase iguais.
        tag: "backfill-ifood",
      })
    }
  }

  if (avisarUserId) {
    const min = Math.round((Date.now() - t0Geral) / 60000)
    await enviarPush([avisarUserId], {
      titulo: "Histórico iFood concluído ✅",
      corpo:
        `${cliente ?? "Todos"}: ${fila.length} lojas processadas em ${min} min. ` +
        `${comHistoricoNovo} ganharam meses novos, ${linhasTotal.toLocaleString("pt-BR")} linhas no total.`,
      url: "/inicio",
      tag: "backfill-ifood",
    })
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
