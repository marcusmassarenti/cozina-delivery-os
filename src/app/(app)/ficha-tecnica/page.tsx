import { redirect } from "next/navigation"
import Link from "next/link"
import { ChefHat, Wallet } from "lucide-react"

import { requireAdmin } from "@/lib/auth/guards"
import { isProPlan } from "@/lib/data/billing"
import { getVisibleUnits } from "@/lib/data/units"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getCustoItens } from "@/lib/data/custo-itens"
import { PeriodSelector } from "@/components/shared/period-selector"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

import { BancadaCusto } from "./_components/bancada-custo"
import { SeletorLoja } from "./_components/seletor-loja"

export const metadata = { title: "Ficha Técnica — Delivery OS" }

/**
 * Ficha Técnica: o custo do que a loja vende, e a margem que sai disso.
 *
 * ── UMA LOJA POR VEZ, DE PROPÓSITO ───────────────────────────────────────
 * Não é filtro de várias lojas como no resto do sistema. O cardápio, o preço e
 * a taxa são de UMA loja — juntar duas produziria uma linha "Sobrecoxa" com o
 * preço médio de lugares que cobram diferente, e um custo que não é de
 * ninguém. Quem opera isso (o Diego, as agências) trabalha loja a loja mesmo.
 *
 * ── A ORDEM É A RECEITA ──────────────────────────────────────────────────
 * Sempre. Não é alfabética nem por plataforma: os 20 primeiros itens de cada
 * loja respondem por 84% a 98% do que ela fatura (medido nas 10 lojas com
 * venda). Ordenar por receita é o que transforma "127 nomes" em "preenche as
 * vinte primeiras linhas e acabou".
 */
export default async function FichaTecnicaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; loja?: string }>
}) {
  if (!(await isProPlan())) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/30 p-10 text-center">
        <Wallet className="size-8 text-muted-foreground" />
        <p className="text-sm font-semibold">
          Ficha técnica é um recurso do plano Pro
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          É ela que mostra quanto sobra em cada item depois da taxa da
          plataforma e do custo da mercadoria.
        </p>
        <Link
          href="/minha-conta/assinatura"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Ver o plano Pro
        </Link>
      </div>
    )
  }

  let ok = false
  try {
    await requireAdmin()
    ok = true
  } catch {
    // não-admin
  }
  if (!ok) redirect("/inicio")

  const sp = await searchParams
  const { range: periodRange, year, month } = readPeriod(sp)

  const units = await getVisibleUnits()
  if (units.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/30 p-10 text-sm text-muted-foreground">
        Cadastre uma loja para começar.
      </div>
    )
  }

  // A loja vem por CÓDIGO na URL (legível quando o link é compartilhado) e cai
  // na primeira do escopo quando não vem — a tela nunca abre sem loja, senão o
  // primeiro contato é uma tela vazia pedindo um clique.
  const loja =
    units.find((u) => u.code === sp.loja) ?? units[0]

  const [resumo, periods] = await Promise.all([
    getCustoItens(loja.id, year, month),
    getAvailablePeriods(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChefHat className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Ficha Técnica
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Digite o custo de cada item e veja quanto sobra depois da taxa da
            plataforma · {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorLoja
            units={units.map((u) => ({ code: u.code, name: u.name }))}
            atual={loja.code}
          />
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      <BancadaCusto
        unitId={loja.id}
        lojaNome={loja.name}
        resumo={resumo}
      />

      <p className="text-[11px] text-muted-foreground">
        Precisa da receita insumo a insumo (a que alimenta a produção do ERP)?
        Ela mora em{" "}
        <Link
          href="/ficha-tecnica/insumos"
          className="font-medium underline underline-offset-2"
        >
          Insumos e receitas
        </Link>
        .
      </p>
    </div>
  )
}
