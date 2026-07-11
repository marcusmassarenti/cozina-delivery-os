"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Star } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  PLATFORM_LABEL,
  REPORTS_CATALOG,
  type ReportKey,
  type ReportPlatform,
} from "@/lib/reports-catalog"
import { saveReportPrefs, type ContaState } from "../_actions"

const PLATFORMS: ReportPlatform[] = ["ifood", "99food", "keeta"]

export function ReportPrefsForm({
  prefs,
}: {
  prefs: Record<ReportKey, boolean>
}) {
  const [state, action] = useActionState<ContaState, FormData>(saveReportPrefs, {
    ok: false,
  })
  // Estado local dos toggles (pra o master por plataforma e o resumo).
  const [on, setOn] = React.useState<Record<string, boolean>>(prefs)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    if (state.ok) {
      setSaved(true)
      const t = setTimeout(() => setSaved(false), 2500)
      return () => clearTimeout(t)
    }
  }, [state])

  const toggle = (key: string) => setOn((s) => ({ ...s, [key]: !s[key] }))
  const setPlatform = (p: ReportPlatform, value: boolean) =>
    setOn((s) => {
      const next = { ...s }
      for (const r of REPORTS_CATALOG) if (r.platform === p) next[r.key] = value
      return next
    })

  const totalOn = Object.values(on).filter(Boolean).length

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        Escolha quais relatórios a sua operação usa. Os que você{" "}
        <b>desligar</b> somem do guia de importação, da cobertura e do
        Diagnóstico — pra não poluir a tela com o que você não puxa.{" "}
        <span className="font-medium text-foreground">
          {totalOn} relatório{totalOn === 1 ? "" : "s"} ligado
          {totalOn === 1 ? "" : "s"}.
        </span>
      </div>

      {PLATFORMS.map((platform) => {
        const reports = REPORTS_CATALOG.filter((r) => r.platform === platform)
        const allOn = reports.every((r) => on[r.key])
        return (
          <section key={platform} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <PlatformLogo
                  platform={platform as PlatformId}
                  className="size-5 rounded"
                />
                <h3 className="text-sm font-semibold">
                  {PLATFORM_LABEL[platform]}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPlatform(platform, !allOn)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allOn ? "Desligar todos" : "Ligar todos"}
              </button>
            </div>
            <div className="divide-y">
              {reports.map((r) => (
                <label
                  key={r.key}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  {/* Checkbox nativo (o form action lê name=key) */}
                  <input
                    type="checkbox"
                    name={r.key}
                    checked={!!on[r.key]}
                    onChange={() => toggle(r.key)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{r.name}</span>
                      {r.essential ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          <Star className="size-2.5 fill-primary" />
                          Essencial
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Avançado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.whatIs}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/70">
                      <span className="font-medium">Ajuda:</span> {r.helps}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </section>
        )
      })}

      {state.message && !state.ok && (
        <p className="text-sm text-rose-600">{state.message}</p>
      )}

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-background/80 py-3 backdrop-blur">
        {saved && (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
            <Check className="size-4" />
            Salvo
          </span>
        )}
        <SaveButton />
      </div>
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar preferências"}
    </button>
  )
}
