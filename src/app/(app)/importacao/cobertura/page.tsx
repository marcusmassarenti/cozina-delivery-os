import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PlatformSwitcher } from "@/components/shared/platform-switcher"
import { getCoverageMatrix } from "@/lib/data/ifood-imported"
import { getNinefoodCoverageMatrix } from "@/lib/data/ninefood-imported"
import { getKeetaCoverageMatrix } from "@/lib/data/keeta-imported"
import { getEnabledReports } from "@/lib/data/report-prefs"
import { getTenantPlatforms } from "@/lib/data/units"
import { currentPeriod } from "@/lib/period"

import { IfoodCoverageView } from "./_components/ifood-coverage-view"
import { NinefoodCoverageView } from "./_components/ninefood-coverage-view"

export default async function CoberturaPage() {
  const { year: endYear, month: endMonth } = currentPeriod()
  const startYear = 2026
  const startMonth = 1

  const [ifoodMatrix, ninefoodMatrix, keetaMatrix, enabledSet, tenantPlats] =
    await Promise.all([
      getCoverageMatrix(startYear, startMonth, endYear, endMonth),
      getNinefoodCoverageMatrix(startYear, startMonth, endYear, endMonth),
      getKeetaCoverageMatrix(startYear, startMonth, endYear, endMonth),
      getEnabledReports(),
      getTenantPlatforms(),
    ])
  const enabled = [...enabledSet]
  const enabledFor = (prefix: string) =>
    enabled.filter((k) => k.startsWith(prefix))
  const ifoodEnabled = enabledFor("ifood_")
  const nineEnabled = enabledFor("99food_")
  const keetaEnabled = enabledFor("keeta_")
  const has = (k: string) => enabledSet.has(k as never)
  const nineShow = {
    loja: has("99food_loja"),
    item: has("99food_item"),
    pedido: has("99food_pedido"),
    recentes: false,
  }
  const keetaShow = {
    loja: has("keeta_loja"),
    item: has("keeta_item"),
    pedido: has("keeta_pedido"),
    recentes: has("keeta_pedido"),
  }

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
        c.pedido.status !== "empty" ||
        c.recentes?.status === "complete",
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
            {new Date(endYear, endMonth - 1, 1).toLocaleDateString("pt-BR", {
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
            platform: "ifood" as const,
            empty: ifoodEnabled.length === 0 || !ifoodHasAnyData,
            content: (
              <IfoodCoverageView matrix={ifoodMatrix} enabled={ifoodEnabled} />
            ),
          },
          {
            platform: "99food" as const,
            empty: nineEnabled.length === 0 || !ninefoodHasAnyData,
            content: (
              <NinefoodCoverageView matrix={ninefoodMatrix} show={nineShow} />
            ),
          },
          {
            platform: "keeta" as const,
            empty: keetaEnabled.length === 0 || !keetaHasAnyData,
            content: (
              <NinefoodCoverageView matrix={keetaMatrix} show={keetaShow} />
            ),
          },
          {
            // Cobertura mede PLANILHA SUBIDA, e o Cardápio Web não tem
            // planilha — sincroniza pela API. Deixá-lo ausente, porém, fazia a
            // tela mentir por omissão: loja 100% em dia via API aparecia como
            // "0% completo · falta importar". Aqui ele aparece dizendo que não
            // depende de ninguém subir nada.
            platform: "cardapioweb" as const,
            empty: false,
            content: (
              <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
                <p className="text-sm font-medium">
                  O Cardápio Web sincroniza sozinho
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Não existe planilha pra subir: pedidos, cardápio, clientes e
                  avaliações entram pela API todo dia. Acompanhe o que já
                  chegou em{" "}
                  <a href="/integracao/cardapioweb" className="underline">
                    Integração Cardápio Web
                  </a>
                  .
                </p>
              </div>
            ),
          },
        ].filter((s) => tenantPlats.includes(s.platform))}
      />
    </div>
  )
}
