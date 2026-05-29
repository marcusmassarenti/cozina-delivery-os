import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PlatformSwitcher } from "@/components/shared/platform-switcher"
import { getCoverageMatrix } from "@/lib/data/ifood-imported"
import { getNinefoodCoverageMatrix } from "@/lib/data/ninefood-imported"
import { getKeetaCoverageMatrix } from "@/lib/data/keeta-imported"

import { IfoodCoverageView } from "./_components/ifood-coverage-view"
import { NinefoodCoverageView } from "./_components/ninefood-coverage-view"

export default async function CoberturaPage() {
  const now = new Date()
  const endYear = now.getFullYear()
  const endMonth = now.getMonth() + 1
  const startYear = 2026
  const startMonth = 1

  const [ifoodMatrix, ninefoodMatrix, keetaMatrix] = await Promise.all([
    getCoverageMatrix(startYear, startMonth, endYear, endMonth),
    getNinefoodCoverageMatrix(startYear, startMonth, endYear, endMonth),
    getKeetaCoverageMatrix(startYear, startMonth, endYear, endMonth),
  ])

  const activeIfood = ifoodMatrix.units.filter((u) => u.active).length
  const ninefoodHasAnyData = ninefoodMatrix.units.some((u) =>
    Object.values(u.cells).some(
      (c) =>
        c.loja.status !== "empty" ||
        c.item.status !== "empty" ||
        c.pedido.status !== "empty",
    ),
  )
  const ifoodHasAnyData = ifoodMatrix.units.some((u) =>
    Object.values(u.cells).some(
      (c) =>
        c.cardapio.status !== "empty" ||
        c.financeiro.status !== "empty" ||
        c.avaliacoes.status !== "empty",
    ),
  )
  const keetaHasAnyData = keetaMatrix.units.some((u) =>
    Object.values(u.cells).some(
      (c) =>
        c.loja.status !== "empty" ||
        c.item.status !== "empty" ||
        c.pedido.status !== "empty",
    ),
  )

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/importacao"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Voltar pra importação
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Cobertura
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O que cada loja tem importado entre janeiro/2026 e{" "}
            {now.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}{" "}
            · {activeIfood} loja{activeIfood !== 1 ? "s" : ""} ativa
            {activeIfood !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <PlatformSwitcher
        slots={[
          {
            platform: "ifood",
            empty: !ifoodHasAnyData,
            content: <IfoodCoverageView matrix={ifoodMatrix} />,
          },
          {
            platform: "99food",
            empty: !ninefoodHasAnyData,
            content: <NinefoodCoverageView matrix={ninefoodMatrix} />,
          },
          {
            platform: "keeta",
            empty: !keetaHasAnyData,
            content: <NinefoodCoverageView matrix={keetaMatrix} />,
          },
        ]}
      />
    </div>
  )
}
