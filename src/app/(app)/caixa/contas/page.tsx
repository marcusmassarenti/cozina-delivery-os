import { getAccountsWithStats, getCaixaHoldingId } from "@/lib/data/caixa"

import { AccountManager } from "../_components/account-manager"

export default async function ContasPage() {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const accounts = (await getAccountsWithStats(holdingId)).filter((a) => a.kind !== "cartao")
  return <AccountManager accounts={accounts} mode="conta" />
}
