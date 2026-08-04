import { headers } from "next/headers"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Cable, Plug, Webhook, Wrench } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"

import { listApiClients } from "@/lib/data/api-clients"
import { isSuperadmin } from "@/lib/auth/permissions"

import { ApiKeysManager } from "./_components/api-keys-manager"
import { PlataformasStatus } from "./_components/plataformas-status"

/**
 * Conexões — hub de integrações.
 *  1) API do Delivery OS (saída): sistemas externos (ERP) puxam dados.
 *  2) Plataformas de delivery (entrada): iFood, 99 Food, Keeta e Cardápio Web
 *     — cada uma com seu estado real e o atalho pra onde se mexe nela.
 */
export default async function ConexoesPage() {
  // Interno da plataforma (chaves de API + integrações) — só super-admin.
  if (!(await isSuperadmin())) notFound()
  const [clients, h] = await Promise.all([listApiClients(), headers()])
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  const baseUrl = `${proto}://${host}`

  const endpoints = [
    {
      method: "GET",
      path: "/api/v1/health",
      desc: "Sanidade (sem autenticação)",
    },
    { method: "GET", path: "/api/v1/units", desc: "Lojas ativas (code, nome)" },
    {
      method: "GET",
      path: "/api/v1/faturamento?year=2026&month=5",
      desc: "DRE da rede por loja + totais",
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Cable className="size-6 text-muted-foreground" />
          Conexões
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Integrações de entrada e saída do sistema.
        </p>
      </div>

      {/* 1) Nossa API (saída) */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Webhook className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              API do Delivery OS
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sistemas externos (ex.: ERP do Cozina Foods) puxam dados da rede
              por REST, autenticando com uma chave de API.
            </p>
          </div>
        </div>

        {/* Base URL + endpoints */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Base URL
            </p>
            <code className="mt-1 block overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
              {baseUrl}
            </code>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Autenticação
            </p>
            <code className="mt-1 block overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px]">
              Authorization: Bearer &lt;sua-chave&gt;
            </code>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Endpoints
            </p>
            <div className="mt-1 space-y-1.5">
              {endpoints.map((e) => (
                <div
                  key={e.path}
                  className="rounded-md border bg-card px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                      {e.method}
                    </span>
                    <code className="truncate font-mono text-[11px]">
                      {e.path}
                    </code>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {e.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chaves */}
        <div className="mt-5 border-t pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Chaves de API
          </h3>
          <ApiKeysManager clients={clients} />
        </div>
      </section>

      {/* 2) Plataformas (entrada) */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Plataformas de delivery</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Ingestão dos dados de cada plataforma, e onde mexer em cada uma.
          iFood e 99 Food entram por API; a Keeta só por relatório importado.
        </p>
        <PlataformasStatus />
      </section>

      {/* Ferramenta de diagnóstico (interno) */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Diagnóstico</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          O painel de homologação de avaliações saiu: o módulo está em produção
          desde julho e o cron traz nota, comentário e tags todo dia. O que fica
          é o console de chamadas cruas, pra quando uma resposta do iFood
          precisar ser olhada por dentro.
        </p>
        <Link
          href="/integracao/ifood-homolog"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <PlatformLogo platform="ifood" size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Testar API do iFood</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dispara chamadas na mão e mostra a resposta crua — token,
              merchants, conciliação.
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>
    </div>
  )
}
