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
import { expandZips } from "@/lib/import/expand-zips"

const initial: ImportBatchState = { ok: false }

export function ImportForm({
  availableUnits,
  cadastroExigente = false,
}: {
  availableUnits: AvailableUnit[]
  /** Cliente SaaS: CNPJ + inauguração obrigatórios no "criar e importar". */
  cadastroExigente?: boolean
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const [progress, setProgress] = React.useState<{
    done: number
    total: number
  } | null>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [localResults, setLocalResults] = React.useState<ImportFileResult[]>(
    [],
  )
  // Wizard: snapshot da fila no momento que o usuário inicia a criação,
  // + idx atual. Quando uma criação termina, avança pro próximo.
  const [wizardQueue, setWizardQueue] = React.useState<ImportFileResult[]>([])
  const [wizardIdx, setWizardIdx] = React.useState<number | null>(null)
  /** true enquanto abre um .zip escolhido pelo usuário. */
  const [expandindo, setExpandindo] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const router = useRouter()

  // Importa UM arquivo por request. A Conciliação do iFood traz dezenas de
  // milhares de lançamentos por loja; mandar todos juntos estoura o timeout da
  // função serverless (e deixa import parcial). Sequencial mantém cada request
  // curta, mostra o progresso loja a loja e isola erros por arquivo.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0 || submitting) return
    setSubmitting(true)
    setLocalResults([])
    setProgress({ done: 0, total: files.length })
    const acc: ImportFileResult[] = []
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData()
      fd.set("files", files[i])
      try {
        const res = await importIfoodReports(initial, fd)
        if (res.results?.length) acc.push(...res.results)
        else
          acc.push({
            filename: files[i].name,
            ok: false,
            message: res.message ?? "Falha ao importar.",
          })
      } catch (err) {
        acc.push({
          filename: files[i].name,
          ok: false,
          message: err instanceof Error ? err.message : "Erro inesperado.",
        })
      }
      setLocalResults([...acc])
      setProgress({ done: i + 1, total: files.length })
    }
    setSubmitting(false)
    setProgress(null)
    router.refresh()
  }

  function startWizardAt(storeId: string) {
    // Fila por LOJA ÚNICA (dedup) — a mesma loja aparece em vários
    // arquivos, mas mapear 1 vez resolve todos.
    const queue = dedupeUnmapped(localResults).filter(
      (r) => r.unmapped && !r.ok,
    )
    const idx = queue.findIndex((r) => r.unmapped?.storeId === storeId)
    if (idx === -1) return
    setWizardQueue(queue)
    setWizardIdx(idx)
  }

  /**
   * Depois que uma loja é vinculada, o mapping existe no banco — então
   * reimporta TODOS os outros arquivos dessa mesma loja (os "irmãos" que
   * ficaram escondidos na dedup), pra os 3 relatórios entrarem.
   */
  async function rescanStore(storeId: string) {
    const siblings = localResults.filter(
      (r) => !r.ok && r.unmapped?.storeId === storeId,
    )
    for (const sib of siblings) {
      const file = files.find(
        (f) => f.name === (sib.originalFilename ?? sib.filename),
      )
      if (!file) continue
      const fd = new FormData()
      fd.set("file", file)
      fd.set("storeId", storeId)
      const res = await recheckAndImport({ ok: false }, fd)
      if (res.result) {
        const updated = res.result
        setLocalResults((prev) =>
          prev.map((r) => (slotKeyOf(r) === slotKeyOf(updated) ? updated : r)),
        )
      }
    }
    router.refresh()
  }

  function handleResultUpdated(updated: ImportFileResult) {
    setLocalResults((prev) =>
      prev.map((r) => (slotKeyOf(r) === slotKeyOf(updated) ? updated : r)),
    )
    const sid =
      updated.ok && updated.summary && "storeId" in updated.summary
        ? updated.summary.storeId
        : undefined
    if (sid) void rescanStore(sid)
  }

  function handleWizardSuccess(updated: ImportFileResult) {
    const storeId = currentWizardResult?.unmapped?.storeId
    setLocalResults((prev) =>
      prev.map((r) => (slotKeyOf(r) === slotKeyOf(updated) ? updated : r)),
    )
    // Avança pro próximo idx da fila
    setWizardIdx((curr) => {
      if (curr == null) return null
      const next = curr + 1
      return next < wizardQueue.length ? next : null
    })
    if (storeId) void rescanStore(storeId)
    else router.refresh()
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

  /**
   * Expande .zip JÁ NO NAVEGADOR. O 99 Food exporta zipado; se só o servidor
   * expandisse, a lista daqui ficaria com o .zip enquanto os resultados vêm
   * com os nomes internos — e o "Criar e importar" / "Verificar de novo" não
   * achavam o arquivo (o botão não fazia nada). Expandindo aqui, cada .xlsx
   * interno vira um arquivo de verdade na lista e tudo casa.
   */
  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const incoming = Array.from(list)
    const temZip = incoming.some((f) => f.name.toLowerCase().endsWith(".zip"))
    let expandidos = incoming
    if (temZip) {
      setExpandindo(true)
      try {
        const { files: out } = await expandZips(incoming)
        expandidos = out
      } catch {
        expandidos = incoming // deixa o servidor tentar; ele tem fallback
      } finally {
        setExpandindo(false)
      }
    }
    setFiles((prev) => {
      const all = [...prev]
      for (const f of expandidos) {
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
    void addFiles(e.dataTransfer.files)
  }

  return (
    // IMPORTANTE: o ResultsList e o CreateUnitDialog têm seus PRÓPRIOS <form>
    // (Atualizar / Criar / Vincular). Eles NÃO podem ficar dentro do <form> de
    // upload — form aninhado é HTML inválido e quebra a hidratação (os botões
    // param de funcionar → "loop"). Por isso o <form> de upload fecha antes.
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Dropzone */}
      <label
        htmlFor="files"
        data-tour="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-background px-4 py-10 transition-colors hover:border-primary/60 hover:bg-muted/40"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Arrasta XLSX, CSV ou ZIP aqui ou clica</p>
        <p className="text-xs text-muted-foreground">
          Vários ao mesmo tempo · iFood (Financeiro · Pedidos · Cardápio ·
          Avaliações), 99 Food (loja · item · pedido) e Keeta (restaurante ·
          pedido · item · promoção)
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
        accept=".xlsx,.csv,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,text/csv"
        className="sr-only"
        onChange={(e) => void addFiles(e.target.files)}
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

      <div className="flex items-center justify-end gap-3">
        {progress && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {progress.done}/{progress.total} arquivos
          </span>
        )}
        <Button
          type="submit"
          data-tour="import-btn"
          disabled={submitting || expandindo || files.length === 0}
        >
          {expandindo
            ? "Abrindo o .zip..."
            : submitting
              ? progress
                ? `Importando ${progress.done + 1}/${progress.total}...`
                : "Importando..."
              : "Importar todos"}
        </Button>
      </div>
      </form>

      {localResults.length > 0 && (
        <ResultsList
          results={dedupeUnmapped(localResults)}
          files={files}
          onCreateUnit={startWizardAt}
          onResultUpdated={handleResultUpdated}
        />
      )}

      {currentWizardResult?.unmapped && currentWizardFile && (
        <CreateUnitDialog
          cadastroExigente={cadastroExigente}
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
    </div>
  )
}

/**
 * Chave do "slot" de um resultado = (arquivo original + storeId). Robusta
 * pra casar a mesma linha quando ela muda de unmapped → ok (o filename
 * troca de "· loja X" pra "· código X", mas o arquivo + storeId não mudam).
 */
function slotKeyOf(r: ImportFileResult): string {
  const file = r.originalFilename ?? r.filename
  const sid =
    r.unmapped?.storeId ??
    (r.summary && "storeId" in r.summary ? r.summary.storeId : "")
  return `${file}|${sid}`
}

/**
 * Deduplica os resultados não-mapeados pela loja (platform + storeId).
 * A mesma loja aparece em vários arquivos (Loja/Itens/Pedidos), mas pro
 * usuário deve aparecer 1 card por loja — mapear 1 vez resolve todos.
 * Resultados ok e de erro são mantidos como estão.
 */
function dedupeUnmapped(results: ImportFileResult[]): ImportFileResult[] {
  const seen = new Set<string>()
  const out: ImportFileResult[] = []
  for (const r of results) {
    if (r.unmapped && !r.ok) {
      const key = `${r.unmapped.platform}|${r.unmapped.storeId}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(r)
  }
  return out
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
                  <p
                    className={`mt-0.5 text-sm ${
                      r.ok
                        ? "text-muted-foreground"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
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
          Loja{" "}
          {unmapped.platform === "ifood"
            ? "iFood"
            : unmapped.platform === "keeta"
              ? "Keeta"
              : "99 Food"}{" "}
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
  if (summary.kind === "keeta_loja") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (loja) · #{summary.unitCode} {summary.unitName} ·{" "}
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
          <Stat label="Cancelados" value={summary.cancelados} />
        </div>
      </div>
    )
  }
  if (summary.kind === "keeta_item") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (cardápio) · #{summary.unitCode} {summary.unitName} ·{" "}
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
  if (summary.kind === "keeta_pedido") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (pedidos) · #{summary.unitCode} {summary.unitName} ·{" "}
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
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat label="Bruto" value={fmtBRL(summary.bruto)} />
          <Stat label="Líquido" value={fmtBRL(summary.liquido)} />
          <Stat
            label="Nota média"
            value={
              summary.notaMedia != null
                ? `${summary.notaMedia.toFixed(2)} ★`
                : "—"
            }
          />
        </div>
      </div>
    )
  }
  if (summary.kind === "keeta_pedido_recente") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (pedidos recentes) · #{summary.unitCode} {summary.unitName} ·{" "}
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
          {summary.atualizados > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {summary.novos} novo(s) · {summary.atualizados} atualizado(s)
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat
            label="Concl./Canc."
            value={`${summary.concluidos} / ${summary.cancelados}`}
          />
          <Stat label="Promo Keeta" value={fmtBRL(summary.promoKeeta)} />
          <Stat label="Promo loja" value={fmtBRL(summary.promoLoja)} />
        </div>
      </div>
    )
  }
  if (summary.kind === "keeta_promocao") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (dados da promoção) · #{summary.unitCode} {summary.unitName} ·{" "}
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
          {summary.atualizados > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {summary.novos} novo(s) · {summary.atualizados} atualizado(s)
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Campanhas" value={summary.campanhas} />
          <Stat label="Linhas" value={summary.linhas} />
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat label="Despesa" value={fmtBRL(summary.despesa)} />
        </div>
      </div>
    )
  }
  if (summary.kind === "keeta_fatura") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Keeta (fatura · repasse) · #{summary.unitCode} {summary.unitName} ·{" "}
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
          {summary.atualizados > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {summary.novos} novo(s) · {summary.atualizados} atualizado(s)
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Dias c/ repasse" value={summary.dias} />
          <Stat label="Total repasse" value={fmtBRL(summary.totalRepasse)} />
          <Stat label="A liquidar" value={fmtBRL(summary.aLiquidar)} />
        </div>
      </div>
    )
  }
  if (summary.kind === "ifood_pedidos") {
    return (
      <div className="mt-1">
        <p className="text-sm font-semibold">
          Pedidos iFood · #{summary.unitCode} {summary.unitName} ·{" "}
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
          {summary.atualizados > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {summary.novos} novo(s) · {summary.atualizados} atualizado(s)
            </span>
          )}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <Stat label="Pedidos" value={summary.pedidos} />
          <Stat label="Pedidos em VR" value={summary.pedidosVr} />
          <Stat label="Valor VR" value={fmtBRL(summary.valorVr)} />
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
