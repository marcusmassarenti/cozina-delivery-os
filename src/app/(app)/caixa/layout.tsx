import { Coins } from "lucide-react"

import { getAccounts, getCaixaHoldingId, getCategoriesFlat, getContacts } from "@/lib/data/caixa"

import { CaixaTabs } from "./_components/caixa-tabs"
import { LancamentoDialog } from "./_components/lancamento-dialog"

export default async function CaixaLayout({ children }: { children: React.ReactNode }) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Nenhum cliente associado ao seu usuário.
      </div>
    )
  }

  const [accounts, categories, contacts] = await Promise.all([
    getAccounts(holdingId),
    getCategoriesFlat(holdingId),
    getContacts(holdingId),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Coins className="size-6 text-muted-foreground" />
          Fluxo de Caixa
        </h1>
        <LancamentoDialog accounts={accounts} categories={categories} contacts={contacts} />
      </div>

      <CaixaTabs />

      {children}
    </div>
  )
}
