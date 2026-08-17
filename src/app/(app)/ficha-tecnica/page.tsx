import { redirect } from "next/navigation"
import Link from "next/link"
import { ChefHat, ListChecks, Tags, Wallet } from "lucide-react"

import { requireAuth } from "@/lib/auth/guards"
import { isProPlan } from "@/lib/data/billing"
import { getVisibleUnits } from "@/lib/data/units"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getLojasCusto } from "@/lib/data/custo-itens"
import { PeriodSelector } from "@/components/shared/period-selector"
import { PlatformLogo } from "@/components/platform-logo"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

import { TourButton } from "@/components/onboarding/tour-button"
import { type CoachStep } from "@/components/onboarding/coach-tour"
import { getCategoriasPadrao } from "@/lib/data/categorias-item"

import { ListaLojas } from "./_components/lista-lojas"
import { CategoriasPadrao } from "./_components/categorias-padrao"

/**
 * O tour da tela. A ordem é a ordem de FAZER, não a de ler: escolher a loja →
 * preencher custo → olhar o resultado. Cada passo aponta pro pedaço da tela
 * que ele explica.
 */
const TOUR_STEPS: CoachStep[] = [
  {
    selector: '[data-tour="ft-rede"]',
    icon: <ListChecks className="size-4" />,
    title: "O que esta tela responde",
    body: "Quanto sobra em cada item que suas lojas vendem, depois do que a plataforma retém e do custo da mercadoria. A barra mostra quanto da sua receita já tem custo preenchido.",
  },
  {
    selector: '[data-tour="ft-categorias"]',
    icon: <Tags className="size-4" />,
    title: "1. Defina suas categorias",
    body: "Churrasco, Bebidas, Combos… uma por linha. Elas valem para todas as lojas — é o que deixa você comparar categoria contra categoria depois, em vez de cada loja inventar um nome.",
  },
  {
    selector: '[data-tour="ft-lista"]',
    icon: <ChefHat className="size-4" />,
    title: "2. Abra uma loja e preencha o custo",
    body: "Cada loja tem o cardápio dela. Comece pelas de cima, que são as de maior receita. Dentro da loja, os itens vêm ordenados do que mais fatura pro que menos — os 20 primeiros costumam ser quase 90% do faturamento.",
  },
  {
    selector: '[data-tour="ft-lista"]',
    icon: <Tags className="size-4" />,
    title: "O custo vale pros próximos meses",
    body: "Ele é do item, não do mês. Preencheu uma vez, aparece em agosto, setembro e adiante. Só volte quando o preço de compra mudar.",
  },
  {
    selector: '[data-tour="ft-lista"]',
    icon: <ListChecks className="size-4" />,
    title: "3. Leia o resultado no Painel",
    body: "Dentro da loja, a aba Painel monta a curva ABC, separa os itens entre Estrela, Enigma, Cavalo de batalha e Abacaxi, e exporta em PDF.",
  },
]

export const metadata = { title: "Ficha Técnica — Delivery OS" }

/**
 * Ficha Técnica: abre pela LISTA DE LOJAS, como Unidades.
 *
 * ── POR QUE NÃO UM SELETOR (Marcus, 16/08/26) ────────────────────────────
 * A primeira versão tinha um `<select>` com as lojas. Com 500 lojas isso é uma
 * lista impossível de percorrer — e, pior, escondia a informação que interessa
 * antes de escolher: quais lojas já têm custo e quais não têm. Agora a tela
 * abre mostrando exatamente isso, e a busca é por digitação, igual Unidades.
 */
export default async function FichaTecnicaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
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

  /**
   * ⚠️ SEM `requireAdmin()` AQUI — e a ausência é o conserto.
   *
   * Diego avisou que os usuários dele "não conseguem entrar, volta pra tela
   * inicial em looping". Não era loop: eram 3 gerentes e 5 franqueados da DG
   * FOODS batendo no `requireAdmin()` e sendo mandados pra /inicio — enquanto o
   * menu continuava oferecendo a tela pra eles. Clica, volta; clica, volta.
   *
   * O gate veio copiado da ficha antiga, que era cadastro interno da Cozina e
   * só de admin. Esta é uma ferramenta operacional, e era a ÚNICA page.tsx do
   * sistema com esse guard: em todas as outras quem governa é o módulo RBAC
   * (`financeiro`) mais o plano. Voltou a seguir o padrão.
   *
   * A escrita continua protegida por loja em `_actions.ts` (requireUnitWrite),
   * que é onde a permissão realmente importa.
   */
  await requireAuth()

  const sp = await searchParams
  const { range: periodRange, year, month } = readPeriod(sp)

  // ⚠️ SÓ AS ATIVAS. Loja encerrada não tem custo a preencher, e ela poluía a
  // lista e o denominador de "X de Y lojas prontas" — dava a impressão de
  // trabalho pendente que não existe.
  const units = (await getVisibleUnits()).filter((u) => u.active)
  const [lojas, periods, categorias] = await Promise.all([
    getLojasCusto(units, year, month),
    getAvailablePeriods(),
    getCategoriasPadrao(),
  ])

  const receita = lojas.reduce((s, l) => s + l.receitaItens, 0)
  const coberta = lojas.reduce((s, l) => s + l.receitaComCusto, 0)

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChefHat className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Ficha Técnica
            </h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lojas.length} {lojas.length === 1 ? "loja" : "lojas"}
            </span>
            <TourButton steps={TOUR_STEPS} autoOpenParam="tour" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Escolha a loja para preencher o custo dos itens ·{" "}
            {formatRangeLabel(periodRange)}
          </p>

          {/* ── De onde vem o item de cada plataforma ─────────────────
              Marcus pediu que a tela explicasse isso, e é a pergunta que ele
              mesmo fez três vezes hoje. As origens são diferentes e não dá pra
              adivinhar: o iFood e a Keeta só entram por planilha; o 99 Food e o
              Cardápio Web entram sozinhos. Sem isso, uma loja sem item parece
              defeito do sistema. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="font-medium">Os itens chegam assim:</span>
            <span className="flex items-center gap-1">
              <PlatformLogo platform="ifood" size="sm" />
              <PlatformLogo platform="keeta" size="sm" />
              relatório de Cardápio, importado por você
            </span>
            <span className="flex items-center gap-1">
              <PlatformLogo platform="99food" size="sm" />
              <PlatformLogo platform="cardapioweb" size="sm" />
              entram sozinhos, pela API
            </span>
            <Link
              href="/importacao"
              className="font-semibold underline underline-offset-2"
            >
              Importar relatórios
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      <div data-tour="ft-categorias">
        <CategoriasPadrao categorias={categorias} />
      </div>

      <ListaLojas
        lojas={lojas}
        receitaRede={receita}
        cobertaRede={coberta}
        periodoQuery={sp.periodo ?? ""}
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
