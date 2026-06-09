import { getAccountsWithStats, getCaixaHoldingId, getCaixaUnits } from "@/lib/data/caixa"

import { AccountManager } from "../_components/account-manager"

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const { loja } = await searchParams
  const [accounts, units] = await Promise.all([
    getAccountsWithStats(holdingId, loja),
    getCaixaUnits(),
  ])
  return (
    <AccountManager
      accounts={accounts.filter((a) => a.kind !== "cartao")}
      mode="conta"
      units={units}
    />
  )
}
