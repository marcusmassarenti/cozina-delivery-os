import {
  getAccounts,
  getCaixaHoldingId,
  getCardInvoices,
  getCategoriesFlat,
} from "@/lib/data/caixa"

import { CardsView } from "../_components/cards-view"

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const { loja } = await searchParams
  const [accounts, categories] = await Promise.all([
    getAccounts(holdingId, loja),
    getCategoriesFlat(holdingId),
  ])
  const cardAccounts = accounts.filter((a) => a.kind === "cartao")
  const contas = accounts.filter((a) => a.kind !== "cartao")
  const cards = await Promise.all(
    cardAccounts.map(async (account) => ({
      account,
      invoices: await getCardInvoices(holdingId, account.id),
    })),
  )

  return <CardsView cards={cards} contas={contas} categories={categories} />
}
