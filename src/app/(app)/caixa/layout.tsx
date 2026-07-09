import Link from "next/link"
import { Coins, Wallet } from "lucide-react"

import { isProPlan } from "@/lib/data/billing"
import {
  getAccounts,
  getCaixaHoldingId,
  getCaixaUnits,
  getCategoriesFlat,
  getContacts,
} from "@/lib/data/caixa"

import { LancamentoDialog } from "./_components/lancamento-dialog"
import { LojaSelector } from "./_components/loja-selector"

export default async function CaixaLayout({ children }: { children: React.ReactNode }) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Nenhum cliente associado ao seu usuário.
      </div>
    )
  }

  // Módulo do plano Pro — gateia todas as sub-rotas do caixa de uma vez.
  if (!(await isProPlan())) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wallet className="size-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            Financeiro é um recurso do plano Pro
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Contas a pagar e a receber, contas bancárias, cartões, categorias e
            importação OFX dos bancos — tudo num lugar. Faça o upgrade pra
            liberar.
          </p>
        </div>
        <Link
          href="/minha-conta/assinatura"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Ver o plano Pro
        </Link>
      </div>
    )
  }

  const [accounts, categories, contacts, units] = await Promise.all([
    getAccounts(holdingId),
    getCategoriesFlat(holdingId),
    getContacts(holdingId),
    getCaixaUnits(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Coins className="size-6 text-muted-foreground" />
          Fluxo de Caixa
        </h1>
        <div className="flex items-center gap-2">
          {units.length > 0 && <LojaSelector units={units} />}
          <LancamentoDialog
            accounts={accounts}
            categories={categories}
            contacts={contacts}
            units={units}
          />
        </div>
      </div>

      {children}
    </div>
  )
}
