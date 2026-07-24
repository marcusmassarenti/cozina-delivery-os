"use client"

import * as React from "react"
import { Check, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlatformLogo } from "@/components/platform-logo"

/** Espelha o retorno de /api/integracao/ifood-review-sync-run. */
type UnitResult = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
  ok: boolean
  gravadas: number
  puladas: number
  status?: number
  motivo?: string
}
type RunResult = {
  ok: boolean
  lojasProcessadas?: number
  totalGravadas?: number
  homologacao?: boolean
  flagRaw?: string
  temCredenciais?: boolean
  appClientId?: string
  resultados?: UnitResult[]
  error?: string
}

/**
 * Botão manual "Sincronizar avaliações iFood". Dispara o pull das avaliações
 * via API (app "review", homologado) e mostra o resultado loja a loja —
 * incluindo as que ainda não autorizaram o app no portal (não é erro, é a
 * etapa manual do Marcus). Cron automático vem depois.
 */
export function SyncReviewIfoodButton() {
  const [pending, setPending] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<RunResult | null>(null)

  async function run() {
    setPending(true)
    setResult(null)
    try {
      const r = await fetch("/api/integracao/ifood-review-sync-run", {
        method: "POST",
      })
      const txt = await r.text()
      let j: RunResult
      try {
        j = JSON.parse(txt) as RunResult
      } catch {
        j = {
          ok: false,
          error:
            r.status === 504 || r.status === 500
              ? "A sincronização demorou mais que o previsto e foi interrompida. O que já sincronizou está salvo — tente de novo."
              : `Não foi possível concluir (erro ${r.status}). Tente de novo.`,
        }
      }
      setResult(j)
    } catch {
      setResult({
        ok: false,
        error: "Falha de conexão. Tente de novo.",
      })
    } finally {
      setPending(false)
      setOpen(true)
    }
  }

  const res = result?.resultados ?? []
  const puxaram = res.filter((r) => r.ok && r.gravadas > 0)
  const semNovas = res.filter((r) => r.ok && r.gravadas === 0)
  const faltaAutorizar = res.filter((r) => !r.ok && r.status === 403)
  const comErro = res.filter((r) => !r.ok && r.status !== 403)
  // Modo homologação + tudo falhando = o flag IFOOD_REVIEW_HOMOLOGATION não
  // está "false", então o app de teste bate nas lojas reais e volta 403.
  const alertaHomolog =
    !!result?.homologacao && puxaram.length === 0 && res.length > 0
  const done = !!result?.ok && !result?.error && !open

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        title="Sincronizar avaliações do iFood agora"
        className="inline-flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : done ? (
          <Check className="size-3" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        {pending
          ? "Sincronizando avaliações…"
          : done
            ? "Avaliações sincronizadas"
            : "Sincronizar avaliações iFood"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlatformLogo platform="ifood" className="size-5" />
              Avaliações iFood
            </DialogTitle>
            <DialogDescription>
              {result?.error
                ? "A sincronização falhou."
                : `${result?.totalGravadas?.toLocaleString("pt-BR") ?? 0} avaliação(ões) atualizada(s) em ${result?.lojasProcessadas ?? 0} loja(s).`}
            </DialogDescription>
          </DialogHeader>

          {result?.error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {result.error}
            </div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              {/* Qual app o servidor está usando de fato — deve ser o e5002ff2… */}
              {result?.appClientId && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  app de Avaliações em uso: <b>{result.appClientId}</b>
                </p>
              )}
              {alertaHomolog && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800/50 dark:bg-amber-950/30">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    App ainda em modo homologação
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Todas as lojas voltaram 403 porque o sistema está usando o
                    app de <b>teste</b> (que só vê a loja sandbox). Isso só
                    acontece se <b>IFOOD_REVIEW_SANDBOX=true</b> estiver setado
                    na Vercel — apague essa var (ou ponha <b>false</b>) e faça{" "}
                    <b>Redeploy</b>.
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-amber-800 dark:text-amber-300">
                    IFOOD_REVIEW_SANDBOX = <b>{result?.flagRaw ?? "?"}</b>
                    {result?.temCredenciais === false &&
                      " · credenciais do app AUSENTES"}
                  </p>
                </div>
              )}
              <Group
                tone="emerald"
                icon={<CheckCircle2 className="size-4" />}
                title="Trouxeram avaliações"
                items={puxaram}
                render={(r) =>
                  `${r.gravadas.toLocaleString("pt-BR")} avaliações`
                }
              />

              {/* A etapa manual do Marcus: loja que ainda não autorizou o app
                  no portal do iFood. Não é erro — é o "habilitar uma a uma". */}
              {faltaAutorizar.length > 0 && (
                <Group
                  tone="amber"
                  icon={<ShieldAlert className="size-4" />}
                  title="Falta autorizar o app no portal iFood"
                  items={faltaAutorizar}
                  render={() => "autorize esta loja no portal e sincronize de novo"}
                />
              )}

              {semNovas.length > 0 && (
                <Group
                  tone="muted"
                  icon={<Check className="size-4" />}
                  title="Sem avaliações novas"
                  items={semNovas}
                  render={() => "já estava em dia"}
                />
              )}

              {comErro.length > 0 && (
                <Group
                  tone="rose"
                  icon={<XCircle className="size-4" />}
                  title="Com erro"
                  items={comErro}
                  render={(r) => r.motivo ?? "erro"}
                />
              )}

              {res.length === 0 && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma loja com merchant iFood vinculado no seu acesso. Vincule
                  em <b>Editar unidade → iFood via API</b> primeiro.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Group({
  tone,
  icon,
  title,
  items,
  render,
}: {
  tone: "emerald" | "amber" | "rose" | "muted"
  icon: React.ReactNode
  title: string
  items: UnitResult[]
  render: (r: UnitResult) => string
}) {
  if (items.length === 0) return null
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "rose"
          ? "text-rose-700 dark:text-rose-400"
          : "text-muted-foreground"

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>
        {icon}
        {title}
        <span className="text-muted-foreground">({items.length})</span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((r) => (
          <li key={r.unitId} className="rounded-md border bg-card px-3 py-2">
            <span className="text-sm font-medium">
              <span className="tabular-nums text-muted-foreground">
                {r.unitCode}
              </span>{" "}
              {r.unitName}
            </span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {render(r)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
