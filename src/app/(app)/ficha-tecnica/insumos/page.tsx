import { redirect } from "next/navigation"
import Link from "next/link"
import { Boxes, ChefHat, Info, Store, Wallet } from "lucide-react"

import { requireAdmin } from "@/lib/auth/guards"
import { isProPlan } from "@/lib/data/billing"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getInsumos, getItensVendidos } from "@/lib/data/producao"
import { PeriodSelector } from "@/components/shared/period-selector"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PlatformFilter } from "@/components/shared/platform-filter"
import { TourButton } from "@/components/onboarding/tour-button"
import { type CoachStep } from "@/components/onboarding/coach-tour"
import { ordenarPlataformas, type PlatformId } from "@/components/platform-logo"
import { getVisibleUnits } from "@/lib/data/units"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

import { InsumoImport } from "./_components/insumo-import"
import { BulkFichaAction } from "./_components/bulk-ficha-action"
import { ItensFichaList } from "./_components/itens-ficha-list"

/**
 * O passo a passo que substituiu a faixa azul fixa no topo.
 *
 * A faixa dizia o essencial, mas custava caro: ocupava espaço em toda visita
 * pra ensinar algo que se aprende uma vez, e o texto terminava num
 * `GET /api/v1/demanda-insumos` — informação de quem integra o ERP, no meio da
 * tela de quem só quer dizer que o X-Salada leva 1 pão e 1 hambúrguer.
 *
 * Aqui cada passo aponta pro pedaço da tela que ele explica, e a ordem é a
 * ordem de fazer: cadastrar insumo → abrir o item → montar a ficha.
 */
const TOUR_STEPS: CoachStep[] = [
  {
    selector: '[data-tour="ft-filtros"]',
    icon: <Store className="size-4" />,
    title: "Escolha o que quer ver",
    body: "Filtre por loja, plataforma e mês. Serve pra montar a ficha de uma loja por vez, ou pra conferir o que uma plataforma específica vendeu no período.",
  },
  {
    selector: '[data-tour="ft-insumos"]',
    icon: <Boxes className="size-4" />,
    title: "1. Cadastre seus insumos",
    body: "Insumo é o que você compra: pão, hambúrguer, queijo, embalagem. Cadastre um por um, cole vários de uma vez, ou suba a planilha modelo. É a lista que vai aparecer pra escolher na ficha.",
  },
  {
    selector: '[data-tour="ft-itens"]',
    icon: <ChefHat className="size-4" />,
    title: "2. Monte a ficha de cada item",
    body: "Aqui estão os itens que suas lojas venderam, do mais vendido pro menos. Abra um e diga quanto ele consome de cada insumo POR UNIDADE VENDIDA — 1 pão, 2 hambúrgueres, 30 g de queijo.",
  },
  {
    selector: '[data-tour="ft-itens"]',
    icon: <Info className="size-4" />,
    title: "Comece pelos de cima",
    body: 'O selo "sem ficha" mostra o que ainda falta. Não precisa cadastrar tudo: os primeiros itens costumam ser a maior parte do volume, então montar os 10 mais vendidos já resolve quase todo o custo.',
  },
]

/**
 * Insumos e receitas — o de-para "item vendido → insumos" que alimenta a
 * demanda de produção do ERP (endpoint /api/v1/demanda-insumos).
 *
 * ⚠️ ESTA NÃO É MAIS A TELA DE FICHA TÉCNICA. Em 16/08/26 a Ficha Técnica
 * passou a ser outra coisa — custo por item vendido, direto na linha, pra sair
 * margem (ver ../page.tsx). Esta aqui ficou porque é ela que mantém o cadastro
 * de insumo → prato que o ERP consome; apagá-la deixaria o endpoint sem quem
 * alimentasse. Não é caminho de cliente: chega por link da tela nova.
 */
export default async function FichaTecnicaPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    lojas?: string
    plataformas?: string
  }>
}) {
  // Deixou de ser interno da Cozina: a ficha técnica é o que dá custo por
  // prato, então virou tela do Financeiro (plano Pro) e não mais um de-para
  // escondido em Integrações, visível só pro super-admin.
  if (!(await isProPlan())) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/30 p-10 text-center">
        <Wallet className="size-8 text-muted-foreground" />
        <p className="text-sm font-semibold">
          Ficha técnica é um recurso do plano Pro
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          É ela que transforma a nota do fornecedor em custo por prato — e a
          venda do dia em demanda de insumo.
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

  // Lojas do filtro: chegam por CÓDIGO na URL (é o que o LojaFilter escreve e
  // o que fica legível num link compartilhado) e viram id aqui.
  const units = await getVisibleUnits()
  const codigos = (sp.lojas ?? "").split(",").filter(Boolean)
  const unitIds = codigos.length
    ? units.filter((u) => codigos.includes(u.code)).map((u) => u.id)
    : undefined

  const [insumos, itensTodos, periods] = await Promise.all([
    getInsumos(),
    getItensVendidos(year, month, null, unitIds),
    getAvailablePeriods(),
  ])

  // Plataforma filtra em memória: o item já vem com a dele, e uma segunda
  // consulta só pra isso seria ida ao banco pra refazer o que está na mão.
  const plats = (sp.plataformas ?? "").split(",").filter(Boolean)
  const itens = plats.length
    ? itensTodos.filter((i) => plats.includes(i.platform))
    : itensTodos

  // Só as plataformas que ESTE mês tem — chip de plataforma sem item por trás
  // é um filtro que só sabe devolver tela vazia.
  const platsComItem = ordenarPlataformas([
    ...new Set(itensTodos.map((i) => i.platform)),
  ] as PlatformId[])

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChefHat className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Insumos e receitas
            </h1>
            {/* Substitui a faixa azul fixa. O passo a passo é o mesmo, mas
                aparece quando a pessoa pede e apontando pra cada parte da
                tela — em vez de ocupar espaço todo dia depois de lido uma vez,
                e falar de endpoint HTTP pra quem só quer montar a receita. */}
            <TourButton steps={TOUR_STEPS} autoOpenParam="tour" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Converte o que as lojas vendem (itens) na demanda de insumos do ERP
            · itens de {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div data-tour="ft-filtros" className="flex flex-wrap items-center gap-2">
          <LojaFilter units={units.map((u) => ({ code: u.code, name: u.name }))} />
          {platsComItem.length > 1 && (
            <PlatformFilter disponiveis={platsComItem} />
          )}
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      <div data-tour="ft-insumos">
        <InsumoImport insumos={insumos} />
      </div>
      {itens.some((i) => i.ficha.length > 0) && (
        <BulkFichaAction itens={itens} insumos={insumos} />
      )}
      <div data-tour="ft-itens">
        <ItensFichaList itens={itens} insumos={insumos} />
      </div>
    </div>
  )
}
