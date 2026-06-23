import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Shield, Star } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { PlatformLogo } from "@/components/platform-logo"

import { ReviewTester } from "./_components/review-tester"

/**
 * Painel interno de homologação do módulo Review (Avaliações) do iFood.
 * Só super-admin. Roda contra a loja sandbox do app de teste.
 */
export default async function IfoodReviewHomologPage() {
  if (!(await isSuperadmin())) notFound()

  const homologEnabled = process.env.IFOOD_REVIEW_HOMOLOGATION !== "false"
  const testCredsSet =
    !!process.env.IFOOD_TEST_CLIENT_ID && !!process.env.IFOOD_TEST_CLIENT_SECRET
  const reviewProdSet =
    !!process.env.IFOOD_REVIEW_CLIENT_ID &&
    !!process.env.IFOOD_REVIEW_CLIENT_SECRET

  const criterios = [
    "GET /reviews com paginação + addCount=true (total, pageCount)",
    "Campos validados: status, replies[], version, visibility",
    "Status do ciclo: CREATED, NOT_REPLIED, REPLIED, PUBLISHED",
    "visibility retorna PUBLIC / PRIVATE",
    "Filtro de data (dateFrom / dateTo)",
    "Responder somente avaliações NOT_REPLIED (POST answers)",
    "Cenário sem avaliações (reviews: [], total: 0) ✓ já confirmado",
    "Requisições reais feitas ≥ 2 dias antes da call",
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <Link
        href="/conexoes"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Conexões
      </Link>

      <div className="flex items-center gap-3">
        <PlatformLogo platform="ifood" size="md" />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Star className="size-5 text-muted-foreground" />
            Homologação · Avaliações (Review)
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Testes do módulo Review v2.0 contra a loja sandbox do app de teste.
          </p>
        </div>
      </div>

      {/* Status de configuração */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatusCard
          ok={homologEnabled}
          label="Modo homologação"
          detail={
            homologEnabled
              ? "Usando app de teste (loja sandbox)"
              : "Produção — usaria o app de Avaliações"
          }
        />
        <StatusCard
          ok={testCredsSet}
          label="Credenciais de teste"
          detail={testCredsSet ? "IFOOD_TEST_* configurado" : "Faltam IFOOD_TEST_*"}
        />
        <StatusCard
          ok={reviewProdSet}
          label="App de produção (Review)"
          detail={reviewProdSet ? "IFOOD_REVIEW_* configurado" : "Faltam IFOOD_REVIEW_*"}
        />
      </div>

      {/* Checklist dos critérios */}
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="size-4 text-muted-foreground" />
          Critérios de homologação do iFood
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {criterios.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          ⏳ Avaliação de teste só aparece depois que um pedido de teste é{" "}
          <b>concluído e avaliado</b>, e há uma janela interna de ~24h antes de
          poder responder. Gere o pedido de teste em{" "}
          <b>Portal → Pedidos de teste</b>.
        </p>
      </div>

      {/* Testers */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Testar endpoints</p>
        <ReviewTester />
      </div>
    </div>
  )
}

function StatusCard({
  ok,
  label,
  detail,
}: {
  ok: boolean
  label: string
  detail: string
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        ok
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
      }`}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{ok ? "OK" : "Pendente"}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}
