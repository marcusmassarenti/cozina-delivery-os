/**
 * Vínculo manual da Marmitex Faisão (Tech Assessoria) no 99 + backfill.
 *
 * POR QUE À MÃO: a loja autorizou o nosso app no portal do 99 (confirmado em
 * /v1/shop/list, 24/08/26) SEM ter uma solicitação de ativação registrada aqui.
 * A tela de vincular parte da solicitação, então essa loja caiu num ponto cego:
 * autorizada lá, invisível aqui.
 *
 * O casamento NÃO é por nome. O `shop_id` que o 99 devolve
 * (5764608225220235003) é idêntico ao id do 99 já cadastrado na unidade —
 * mesmo número dos dois lados, único na base.
 *
 * Rodar: npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local scripts/vincular-faisao-99.ts
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { backfillDeUmaLoja99 } from "../src/lib/ninefood/backfill"

const APP_SHOP_ID = "tech-faisao-01"
const SHOP_ID = "5764608225220235003"
const UNIT_ID = "9e19c79b-a59d-40b0-9041-d1a970802fc4" // Marmitex Faisão Restaurante (Tech, cód. 02)

async function main() {
  const admin = createAdminClient()

  // Trava de segurança: se o app_shop_id já apontar pra OUTRA unidade, para.
  // Repontar jogaria o financeiro de um lojista no painel de outro.
  const { data: existente } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
    .eq("app_shop_id", APP_SHOP_ID)
    .maybeSingle()
  const dono = (existente as { unit_id: string | null } | null)?.unit_id
  if (dono && dono !== UNIT_ID) {
    throw new Error(`${APP_SHOP_ID} já está vinculado a ${dono}. Confira antes.`)
  }

  // Confere que a unidade é mesmo a dona daquele id do 99.
  const { data: plat } = await admin
    .from("unit_platforms")
    .select("unit_id")
    .eq("platform", "99food")
    .eq("external_store_id", SHOP_ID)
  const donos = ((plat ?? []) as { unit_id: string }[]).map((p) => p.unit_id)
  if (donos.length !== 1 || donos[0] !== UNIT_ID) {
    throw new Error(`shop_id ${SHOP_ID} não bate com a unidade: ${JSON.stringify(donos)}`)
  }

  const { error } = await admin.from("ninefood_store_links").upsert(
    {
      app_shop_id: APP_SHOP_ID,
      unit_id: UNIT_ID,
      id_loja: SHOP_ID,
      name: "Marmitex Faisão Restaurante",
      active: true,
    },
    { onConflict: "app_shop_id" },
  )
  if (error) throw new Error(error.message)
  console.log(`✅ vínculo criado: ${APP_SHOP_ID} → Marmitex Faisão Restaurante`)

  console.log("→ backfill do histórico (limite do 99, até hoje)...")
  const r = await backfillDeUmaLoja99(APP_SHOP_ID)
  if (!r) {
    console.log("backfill não rodou (já tinha carimbo de histórico).")
    return
  }
  console.log(
    `${r.concluido ? "✅" : "⚠️"} ${r.meses} mês(es) · ${r.linhas} lançamento(s)` +
      (r.erros.length ? `\nerros: ${r.erros.join(" | ")}` : ""),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
