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

  // Roteiro de gravação — cada passo mapeia 1 clique na tela abaixo + o
  // resultado ESPERADO (validado ao vivo contra a sandbox em 02/07/2026).
  const roteiro: { cenario: string; passo: string; acao: string; esperado: string }[] = [
    {
      cenario: "1 · Listar",
      passo: "Listar avaliações",
      acao: 'Clique em "Listar avaliações"',
      esperado: "HTTP 200 · total 3 · campos nota, status, comentário, replies[]",
    },
    {
      cenario: "1 · Filtro de data",
      passo: "Filtro por período",
      acao: "Datas já vêm preenchidas (60 dias). Clique em \"Listar avaliações\"",
      esperado: "HTTP 200 · mostra o filtro dateFrom → dateTo (janela ≤ 90 dias)",
    },
    {
      cenario: "1 · Limite de página",
      passo: "Página > 50",
      acao: 'Clique em "Testar limite (>50 → 400)"',
      esperado: 'HTTP 400 · "page size can\'t exceed 50"',
    },
    {
      cenario: "2 · Detalhe",
      passo: "Detalhe de 1 avaliação",
      acao: 'Clique no "1º reviewId" do resultado (preenche o campo) → "Ver detalhe"',
      esperado: "HTTP 200 · avaliação completa (nota, comentário, replies)",
    },
    {
      cenario: "2 · ID inexistente",
      passo: "Detalhe de ID inválido",
      acao: 'Clique em "Testar ID inexistente"',
      esperado: "HTTP 404 · Not Found",
    },
    {
      cenario: "3 · Responder",
      passo: "Responder (NOT_REPLIED)",
      acao: 'Com o reviewId preenchido, clique em "Responder"',
      esperado: "HTTP 201 · resposta gravada em replies[]",
    },
    {
      cenario: "3 · Texto inválido",
      passo: "Recusa de texto inválido",
      acao: 'Clique em "Texto curto (< 10)" e depois "Texto vazio"',
      esperado: 'HTTP 400 · recusado ("blank" / "minimum of 10 and a max of 300")',
    },
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

      {/* Roteiro de gravação */}
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="size-4 text-muted-foreground" />
          Roteiro da gravação — siga na ordem
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Cada passo = 1 clique nos cenários abaixo. Grave a tela mostrando o
          resultado esperado de cada um. Resultados validados ao vivo na
          sandbox.
        </p>
        <ol className="mt-3 flex flex-col gap-2">
          {roteiro.map((r, i) => (
            <li
              key={r.passo}
              className="flex items-start gap-3 rounded-md border bg-muted/30 p-2.5"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  <span className="text-muted-foreground">
                    Cenário {r.cenario}
                  </span>{" "}
                  · {r.passo}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.acao}
                </p>
                <p className="mt-1 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                  esperado: {r.esperado}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
          ✅ A loja sandbox já tem <b>3 avaliações</b> (2 ainda NOT_REPLIED pra
          demonstrar o &quot;Responder&quot;). O iFood exige que as requisições
          reais tenham sido feitas <b>≥ 2 dias antes</b> da call — as primeiras
          chamadas já ficaram registradas nos logs.
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
