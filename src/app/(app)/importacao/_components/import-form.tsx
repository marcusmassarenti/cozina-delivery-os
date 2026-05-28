"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"

import {
  importIfoodReports,
  recheckAndImport,
  type ImportBatchState,
  type ImportFileResult,
  type ImportSummary,
  type RecheckAndImportState,
} from "../_actions"
import { CreateUnitDialog, type AvailableUnit } from "./create-unit-dialog"

const initial: ImportBatchState = { ok: false }

export function ImportForm({
  availableUnits,
}: {
  availableUnits: AvailableUnit[]
}) {
  const [state, formAction] = useActionState(importIfoodReports, initial)
  const [files, setFiles] = React.useState<File[]>([])
  const [localResults, setLocalResults] = React.useState<ImportFileResult[]>(
    [],
  )
  // Wizard: snapshot da fila no momento que o usuário inicia a criação,
  // + idx atual. Quando uma criação termina, avança pro próximo.
  const [wizardQueue, setWizardQueue] = React.useState<ImportFileResult[]>([])
  const [wizardIdx, setWizardIdx] = React.useState<number | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const router = useRouter()

  React.useEffect(() => {
    if (state.results) {
      setLocalResults(state.results)
      if (state.results.some((r) => r.ok)) router.refresh()
    }
  }, [state, router])

  function startWizardAt(storeId: string) {
    const queue = localResults.filter((r) => r.unmapped && !r.ok)
    const idx = queue.findIndex((r) => r.unmapped?.storeId === storeId)
    if (idx === -1) return
    setWizardQueue(queue)
    setWizardIdx(idx)
  }

  function handleWizardSuccess(updated: ImportFileResult) {
    setLocalResults((prev) =>
      prev.map((r) => (r.filename === updated.filename ? updated : r)),
    )
    // Avança pro próximo idx da fila
    setWizardIdx((curr) => {
      if (curr == null) return null
      const next = curr + 1
      return next < wizardQueue.length ? next : null
    })
    router.refresh()
  }

  function handleWizardClose(open: boolean) {
    if (!open) {
      setWizardIdx(null)
      setWizardQueue([])
    }
  }

  const currentWizardResult =
    wizardIdx != null ? wizardQueue[wizardIdx] : null
  const currentWizardFile = currentWizardResult
    ? files.find(
        (f) =>
          f.name ===
          (currentWizardResult.originalFilename ?? currentWizardResult.filename),
      )
    : undefined

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const incoming = Array.from(list)
    setFiles((prev) => {
      const all = [...prev]
      for (const f of incoming) {
        if (!all.some((x) => x.name === f.name && x.size === f.size)) {
          all.push(f)
        }
      }
      return all
    })
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function clearAll() {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Sincroniza o input file com o state (necessário pro FormData)
  React.useEffect(() => {
    if (!fileInputRef.current) return
    const dt = new DataTransfer()
    files.forEach((f) => dt.items.add(f))
    fileInputRef.current.files = dt.files
  }, [files])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  return (
    <form
      ref={formRef}
      action={(fd) => {
        formAction(fd)
        // limpa só se todos der certo (vamos checar no effect)
      }}
      className="flex flex-col gap-4"
    >
      {/* Dropzone */}
      <label
        htmlFor="files"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-background px-4 py-10 transition-colors hover:border-primary/60 hover:bg-muted/40"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Arrasta XLSX aqui ou clica</p>
        <p className="text-xs text-muted-foreground">
          Vários ao mesmo tempo · iFood (Cardápio · Financeiro · Avaliações) e
          99 Food (Dados da loja · Dados do item)
        </p>
        <p className="text-[10px] text-muted-foreground">
          A plataforma e a unidade são detectadas automaticamente pelo arquivo
        </p>
      </label>
      <input
        ref={fileInputRef}
        id="files"
        name="files"
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Lista de selecionados */}
      {files.length > 0 && (
        <div className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Label className="text-xs font-medium">
              {files.length} arquivo{files.length > 1 ? "s" : ""} selecionado
              {files.length > 1 ? "s" : ""}
            </Label>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-muted-foreground hover:text-rose-600"
            >
              Limpar
            </button>
          </div>
          <ul className="divide-y">
            {files.map((f, idx) => (
              <li
                key={`${f.name}-${idx}`}
                className="flex items-center gap-2 px-3 py-2"
              >
                <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {f.name}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-muted-foreground hover:text-rose-600"
                  aria-label="Remover"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <SubmitButton disabled={files.length === 0} />
      </div>

      {state.message && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      {localResults.length > 0 && (
        <ResultsList
          results={localResults}
          files={files}
          onCreateUnit={startWizardAt}
          onResultUpdated={(updated) =>
            setLocalResults((prev) =>
              prev.map((r) =>
                r.filename === updated.filename ? updated : r,
              ),
            )
          }
        />
      )}

      {currentWizardResult?.unmapped && currentWizardFile && (
        <CreateUnitDialog
          open
          onOpenChange={handleWizardClose}
          unmapped={currentWizardResult.unmapped}
          file={currentWizardFile}
          availableUnits={availableUnits}
          progress={{
            current: (wizardIdx ?? 0) + 1,
            total: wizardQueue.length,
          }}
          onSuccess={handleWizardSuccess}
        />
      )}
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Importando..." : "Importar todos"}
    </Button>
  )
}

function ResultsList({
  results,
  files,
  onCreateUnit,
  onResultUpdated,
}: {
  results: ImportFileResult[]
  files: File[]
  onCreateUnit: (storeId: string) => void
  onResultUpdated: (updated: ImportFileResult) => void
}) {
  const okCount = results.filter((r) => r.ok).length
  const unmappedCount = results.filter((r) => r.unmapped).length
  const errCount = results.length - okCount - unmappedCount

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        {okCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span className="font-medium">{okCount} sucesso</span>
          </div>
        )}
        {unmappedCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <HelpCircle className="size-3.5 text-amber-600" />
            <span className="font-medium">
              {unmappedCount} loja{unmappedCount > 1 ? "s" : ""} desconhecida
              {unmappedCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
        {errCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <XCircle className="size-3.5 text-rose-600" />
            <span className="font-medium">{errCount} com erro</span>
          </div>
        )}
      </div>
      <ul className="divide-y">
        {results.map((r, idx) => (
          <li key={idx} className="p-4">
            <div className="flex items-start gap-3">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : r.unmapped ? (
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {r.filename}
                </p>
                {r.ok && r.summary ? (
                  <ResultSummary summary={r.summary} />
                ) : r.unmapped ? (
                  <UnmappedResult
                    result={r}
                    files={files}
                    onCreate={onCreateUnit}
                    onResultUpdated={onResultUpdated}
                  />
                ) : (
                  <p className="mt-0.5 text-sm text-rose-700 dark:text-rose-400">
                    {r.message}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const recheckInitial: RecheckAndImportState = { ok: false }

function UnmappedResult({
  result,
  files,
  onCreate,
  onResultUpdated,
}: {
  result: ImportFileResult
  files: File[]
  onCreate: (storeId: string) => void
  onResultUpdated: (updated: ImportFileResult) => void
}) {
  const unmapped = result.unmapped!
  const [state, formAction] = useActionState(recheckAndImport, recheckInitial)
  const notifiedRef = React.useRef(false)
  const [feedbackMessage, setFeedbackMessage] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (state.result && !notifiedRef.current) {
      notifiedRef.current = true
      onResultUpdated(state.result)
    }
    if (state.message && !state.ok) {
      setFeedbackMessage(state.message)
    }
  }, [state, onResultUpdated])

  // Acha o file original (importante pra arquivos multi-loja que viraram
  // N results: usa `originalFilename` quando existir)
  const file = files.find(
    (f) => f.name === (result.originalFilename ?? result.filename),
  )

  return (
    <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <p className="text-sm font-semibold">
          Loja {unmapped.platform === "ifood" ? "iFood" : "99 Food"}{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            #{unmapped.storeId}
          </span>{" "}
          ainda não cadastrada
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Detectado no {unmapped.reportTypeLabel}
          {unmapped.suggestedName && ` · sugestão: ${unmapped.suggestedName}`}
        </p>
        {feedbackMessage && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {feedbackMessage}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {file && (
          <form
            action={(fd) => {
              notifiedRef.current = false
              setFeedbackMessage(null)
              fd.set("file", file, file.name)
              fd.set("storeId", unmapped.storeId)
              formAction(fd)
            }}
          >
            <RecheckButton />
          </form>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => onCreate(unmapped.storeId)}
          className="gap-1.5"
        >
          <PlusIcon />
          Criar e importar
        </Button>
      </div>
    </div>
  )
}

function RecheckButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      className="gap-1.5"
    >
      <RefreshCw className={`size-3 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Verificando..." : "Atualizar"}
    </Button>
  )
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ResultSummary({ summary }: { summary: ImportSummary }) {
  if (summary.kind === "cardapio") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Cardápio · #{summary.unitCode} {summary.unitName} ·{" "}
          {new Date(summary.date + "T00:00:00").toLocaleDateString("pt-BR")}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              substituído
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat
            label="Conversão"
            value={`${summary.conversao.toFixed(2)}%`}
          />
          <Stat label="Itens" value={summary.itensCount} />
          <Stat label="Complementos" value={summary.complementosCount} />
        </div>
      </div>
    )
  }
  if (summary.kind === "cardapio_periodo") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Cardápio (período) · #{summary.unitCode} {summary.unitName} ·{" "}
          {new Date(summary.periodoInicio + "T00:00:00").toLocaleDateString(
            "pt-BR",
          )}{" "}
          →{" "}
          {new Date(summary.periodoFim + "T00:00:00").toLocaleDateString(
            "pt-BR",
          )}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              substituído
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
          <Stat label="Visitas" value={summary.visitas.toLocaleString("pt-BR")} />
          <Stat label="Concluídos" value={summary.concluidos.toLocaleString("pt-BR")} />
          <Stat label="Conversão" value={`${summary.conversao.toFixed(2)}%`} />
        </div>
      </div>
    )
  }
  if (summary.kind === "financeiro") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Financeiro · #{summary.unitCode} {summary.unitName} ·{" "}
          {summary.competencia}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              substituído
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Pedidos" value={summary.pedidosUnicos} />
          <Stat label="Bruto" value={fmtBRL(summary.bruto)} />
          <Stat label="Líquido" value={fmtBRL(summary.liquido)} />
          <Stat label="Cancelados" value={summary.cancelTotalQtd} />
        </div>
      </div>
    )
  }
  if (summary.kind === "ninefood_loja") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          99 Food (loja) · #{summary.unitCode} {summary.unitName} ·{" "}
          {new Date(summary.periodoInicio + "T00:00:00").toLocaleDateString(
            "pt-BR",
          )}
          {summary.periodoInicio !== summary.periodoFim && (
            <>
              {" → "}
              {new Date(summary.periodoFim + "T00:00:00").toLocaleDateString(
                "pt-BR",
              )}
            </>
          )}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              substituído
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Dias" value={summary.diasImportados} />
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat label="Bruto" value={fmtBRL(summary.bruto)} />
          <Stat label="Líquido" value={fmtBRL(summary.liquido)} />
          {summary.avaliacao != null && (
            <Stat
              label="Nota média"
              value={`${summary.avaliacao.toFixed(2)} ★`}
            />
          )}
        </div>
      </div>
    )
  }
  if (summary.kind === "ninefood_pedido") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          99 Food (pedidos) · #{summary.unitCode} {summary.unitName} ·{" "}
          {new Date(summary.periodoInicio + "T00:00:00").toLocaleDateString(
            "pt-BR",
          )}
          {summary.periodoInicio !== summary.periodoFim && (
            <>
              {" → "}
              {new Date(summary.periodoFim + "T00:00:00").toLocaleDateString(
                "pt-BR",
              )}
            </>
          )}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {summary.atualizadasAvaliacoes} atualizados ·{" "}
              {summary.pedidos - summary.atualizadasAvaliacoes} novos
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat label="Avaliados" value={summary.avaliados} />
          <Stat
            label="Nota média"
            value={
              summary.notaMedia != null
                ? `${summary.notaMedia.toFixed(2)} ★`
                : "—"
            }
          />
          <Stat
            label="Novos / Recor."
            value={`${summary.clientesNovos} / ${summary.clientesRecorrentes}`}
          />
        </div>
      </div>
    )
  }
  if (summary.kind === "ninefood_item") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          99 Food (cardápio) · #{summary.unitCode} {summary.unitName} ·{" "}
          {new Date(summary.periodoInicio + "T00:00:00").toLocaleDateString(
            "pt-BR",
          )}
          {summary.periodoInicio !== summary.periodoFim && (
            <>
              {" → "}
              {new Date(summary.periodoFim + "T00:00:00").toLocaleDateString(
                "pt-BR",
              )}
            </>
          )}
          {summary.substituido && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              substituído
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Dias" value={summary.diasImportados} />
          <Stat label="Linhas (item·dia)" value={summary.itensCount} />
          <Stat label="Receita total" value={fmtBRL(summary.receitaTotal)} />
        </div>
      </div>
    )
  }
  // avaliacoes (último kind restante)
  const periodo = `${new Date(summary.periodoInicio + "T00:00:00").toLocaleDateString("pt-BR")} → ${new Date(summary.periodoFim + "T00:00:00").toLocaleDateString("pt-BR")}`
  return (
    <div className="mt-1">
      <p className="text-sm font-semibold">
        Avaliações · #{summary.unitCode} {summary.unitName} · {periodo}
        {summary.atualizadas > 0 && (
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            {summary.novas} nova(s) · {summary.atualizadas} atualizada(s)
          </span>
        )}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
        <Stat label="Total" value={summary.totalAvaliacoes} />
        <Stat
          label="Nota média"
          value={`${summary.notaMedia.toFixed(2)} ★`}
        />
        <Stat label="Com comentário" value={summary.comComentario} />
        <Stat
          label="5★"
          value={`${summary.distribucao[5]} (${((summary.distribucao[5] / summary.totalAvaliacoes) * 100).toFixed(0)}%)`}
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}
