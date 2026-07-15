"use client"

import * as React from "react"
import { Download, FileText, RefreshCw } from "lucide-react"

import {
  cancelarNfTeste,
  configurarNfAutomatica,
  emitirNfTeste,
  statusNfTeste,
  type NfTesteState,
} from "../_actions"

/** Status da NF no Asaas → texto pro humano. */
const STATUS: Record<string, string> = {
  SCHEDULED: "agendada — aguardando a prefeitura",
  SYNCHRONIZED: "processando na prefeitura",
  AUTHORIZED: "AUTORIZADA pela prefeitura ✓",
  PROCESSING_CANCELLATION: "cancelamento em andamento",
  CANCELED: "cancelada",
  CANCELLATION_DENIED: "cancelamento negado",
  ERROR: "ERRO — a prefeitura recusou",
}

/**
 * Card de NF do super-admin: liga a emissão automática nas assinaturas antigas
 * e permite um teste real de R$ 1 (sem cobrança) pra provar que a prefeitura
 * autoriza com os nossos dados fiscais.
 */
export function NfSetupButton() {
  const [pending, setPending] = React.useState<string | null>(null)
  const [setup, setSetup] = React.useState<{
    ok: boolean
    message?: string
  } | null>(null)
  const [teste, setTeste] = React.useState<NfTesteState | null>(null)

  async function aplicar() {
    setPending("setup")
    setSetup(null)
    setSetup(await configurarNfAutomatica())
    setPending(null)
  }

  async function emitir() {
    if (
      !confirm(
        "Emite uma nota fiscal REAL de R$ 1. Ela vai pra prefeitura e entra na contabilidade — dá pra cancelar aqui mesmo depois. Continuar?",
      )
    )
      return
    setPending("emitir")
    setTeste(null)
    setTeste(await emitirNfTeste())
    setPending(null)
  }

  async function atualizar() {
    if (!teste?.invoiceId) return
    setPending("status")
    const novo = await statusNfTeste(teste.invoiceId)
    setTeste((old) => ({ ...old, ...novo, tomador: old?.tomador }))
    setPending(null)
  }

  async function cancelar() {
    if (!teste?.invoiceId) return
    setPending("cancelar")
    const novo = await cancelarNfTeste(teste.invoiceId)
    setTeste((old) => ({ ...old, ...novo, tomador: old?.tomador }))
    setPending(null)
  }

  const box = (ok: boolean) =>
    `mt-3 rounded-md border px-3 py-2 text-xs ${
      ok
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
    }`

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            Emissão automática de nota fiscal
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Assinatura nova já nasce emitindo sozinha. Use isto pras que já
            existiam, ou depois de mudar o código de serviço / a alíquota.
          </p>
        </div>
        <button
          type="button"
          onClick={aplicar}
          disabled={pending !== null}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending === "setup" ? "Configurando..." : "Aplicar nas assinaturas"}
        </button>
      </div>

      {setup && <div className={box(setup.ok)}>{setup.message}</div>}

      {/* Teste real — a única prova de que a prefeitura autoriza */}
      <div className="mt-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Testar emissão (R$ 1)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Emite uma nota real de R$ 1 sem cobrança nenhuma, pra ver se a
              prefeitura autoriza. Cancele aqui mesmo depois de conferir.
            </p>
          </div>
          <button
            type="button"
            onClick={emitir}
            disabled={pending !== null}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {pending === "emitir" ? "Emitindo..." : "Emitir nota de teste"}
          </button>
        </div>

        {teste && (
          <div className={box(teste.ok && teste.status !== "ERROR")}>
            {teste.message && <p>{teste.message}</p>}
            {teste.tomador && (
              <p className="mt-1">
                <strong>Tomador:</strong> {teste.tomador}
              </p>
            )}
            {teste.status && (
              <p className="mt-1">
                <strong>Status:</strong> {STATUS[teste.status] ?? teste.status}
              </p>
            )}

            {teste.invoiceId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={atualizar}
                  disabled={pending !== null}
                  className="inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  <RefreshCw className="size-3" />
                  {pending === "status" ? "Lendo..." : "Atualizar status"}
                </button>
                {teste.pdfUrl && (
                  <a
                    href={teste.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 font-medium transition-opacity hover:opacity-70"
                  >
                    <Download className="size-3" />
                    Ver o PDF
                  </a>
                )}
                {teste.status !== "CANCELED" && (
                  <button
                    type="button"
                    onClick={cancelar}
                    disabled={pending !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                  >
                    {pending === "cancelar"
                      ? "Cancelando..."
                      : "Cancelar a nota de teste"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
