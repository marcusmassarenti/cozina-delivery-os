"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CheckCircle2, Link2, Plus, Store } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validacaoPtBr } from "@/components/shared/form-validacao-ptbr"

import {
  createUnitAndImport,
  linkUnitAndImport,
  type CreateUnitAndImportState,
  type LinkUnitAndImportState,
  type ImportFileResult,
} from "../_actions"

const UFs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export type AvailableUnit = {
  id: string
  code: string
  name: string
  platforms: PlatformId[]
  externalStoreIds: Partial<Record<PlatformId, string | null>>
}

const createInitial: CreateUnitAndImportState = { ok: false }
const linkInitial: LinkUnitAndImportState = { ok: false }

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

/**
 * Modal pra resolver loja desconhecida no XLSX. 2 modos:
 *   - "Vincular existente": adiciona o ID da loja na plataforma de uma
 *     unidade que já existe (caso comum quando a loja já foi cadastrada
 *     por outra plataforma).
 *   - "Criar nova": forma full pra cadastrar a unidade do zero.
 *
 * CONTROLLED pelo parent (ImportForm) pra permitir wizard auto-advance
 * pras próximas lojas desconhecidas.
 */
export function CreateUnitDialog({
  open,
  onOpenChange,
  unmapped,
  file,
  availableUnits,
  progress,
  onSuccess,
  cadastroExigente = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unmapped: NonNullable<ImportFileResult["unmapped"]>
  file: File
  availableUnits: AvailableUnit[]
  progress?: { current: number; total: number }
  onSuccess: (result: ImportFileResult) => void
  /** Cliente SaaS: CNPJ + inauguração obrigatórios no cadastro. */
  cadastroExigente?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogInner
          key={unmapped.storeId}
          unmapped={unmapped}
          file={file}
          availableUnits={availableUnits}
          progress={progress}
          onSuccess={onSuccess}
          onCancel={() => onOpenChange(false)}
          cadastroExigente={cadastroExigente}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Normaliza string pra match (minúsculo, sem acento). */
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

/**
 * Adivinha qual unidade casa com a loja do relatório, pelo nome/cidade
 * sugeridos (ex: "Churrasco no Pote — Brooklin" → unidade "Brooklin").
 * Cai pra primeira elegível se não achar.
 */
function guessUnitId(
  units: AvailableUnit[],
  unmapped: NonNullable<ImportFileResult["unmapped"]>,
): string {
  const hay = normalizeStr(
    `${unmapped.suggestedName ?? ""} ${unmapped.suggestedCity ?? ""}`,
  )
  if (hay) {
    const match = units.find((u) => {
      const n = normalizeStr(u.name)
      return n.length >= 3 && hay.includes(n)
    })
    if (match) return match.id
  }
  return units[0]?.id ?? ""
}

function DialogInner({
  unmapped,
  file,
  availableUnits,
  progress,
  onSuccess,
  onCancel,
  cadastroExigente = false,
}: {
  unmapped: NonNullable<ImportFileResult["unmapped"]>
  file: File
  availableUnits: AvailableUnit[]
  progress?: { current: number; total: number }
  onSuccess: (result: ImportFileResult) => void
  onCancel: () => void
  cadastroExigente?: boolean
}) {
  // Filtra unidades que já têm essa plataforma com OUTRO ID (não pode reusar)
  const eligibleUnits = availableUnits.filter((u) => {
    const existing = u.externalStoreIds[unmapped.platform]
    return !existing // só elegível se ainda não tem ID dessa plataforma
  })

  // Default mode: "link" se há unidades elegíveis, senão "create"
  const [mode, setMode] = React.useState<"link" | "create">(
    eligibleUnits.length > 0 ? "link" : "create",
  )
  const platformLabel =
    unmapped.platform === "ifood"
      ? "iFood"
      : unmapped.platform === "keeta"
        ? "Keeta"
        : "99 Food"

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Store className="size-4" />
          Loja desconhecida no relatório
          {progress && progress.total > 1 && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {progress.current} de {progress.total}
            </span>
          )}
        </DialogTitle>
        <DialogDescription>
          Loja {platformLabel}{" "}
          <span className="font-mono font-semibold">
            #{unmapped.storeId}
          </span>{" "}
          detectada no relatório de {unmapped.reportTypeLabel}, mas o ID ainda
          não está vinculado a nenhuma unidade.
        </DialogDescription>
        {unmapped.suggestedName && (
          <div className="mt-1 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/30">
            <Store className="size-3.5 shrink-0 text-amber-600" />
            <span className="text-amber-900 dark:text-amber-300">
              Loja no relatório:{" "}
              <strong className="font-semibold">{unmapped.suggestedName}</strong>
              {unmapped.suggestedCity &&
                unmapped.suggestedCity !== unmapped.suggestedName && (
                  <> · {unmapped.suggestedCity}</>
                )}
            </span>
          </div>
        )}
      </DialogHeader>

      {/* Tabs */}
      <div className="flex gap-1 rounded-md bg-muted p-1">
        <ModeTab
          active={mode === "link"}
          onClick={() => setMode("link")}
          icon={<Link2 className="size-3.5" />}
          label="Vincular a uma unidade existente"
          disabled={eligibleUnits.length === 0}
          hint={
            eligibleUnits.length === 0
              ? "Todas as unidades já têm essa plataforma vinculada"
              : `${eligibleUnits.length} elegível${eligibleUnits.length > 1 ? "is" : ""}`
          }
        />
        <ModeTab
          active={mode === "create"}
          onClick={() => setMode("create")}
          icon={<Plus className="size-3.5" />}
          label="Criar nova unidade"
        />
      </div>

      {mode === "link" ? (
        <LinkForm
          unmapped={unmapped}
          file={file}
          eligibleUnits={eligibleUnits}
          progress={progress}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      ) : (
        <CreateForm
          unmapped={unmapped}
          file={file}
          progress={progress}
          onSuccess={onSuccess}
          onCancel={onCancel}
          cadastroExigente={cadastroExigente}
        />
      )}
    </>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
  hint,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : disabled
            ? "text-muted-foreground/50"
            : "text-muted-foreground hover:bg-background/60"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
      </div>
      {hint && <span className="text-[9px] opacity-70">{hint}</span>}
    </button>
  )
}

// ─── Modo 1: Vincular a unidade existente ──────────────────────────

function LinkForm({
  unmapped,
  file,
  eligibleUnits,
  progress,
  onSuccess,
  onCancel,
}: {
  unmapped: NonNullable<ImportFileResult["unmapped"]>
  file: File
  eligibleUnits: AvailableUnit[]
  progress?: { current: number; total: number }
  onSuccess: (result: ImportFileResult) => void
  onCancel: () => void
}) {
  const [state, formAction] = useActionState(linkUnitAndImport, linkInitial)
  const [unitId, setUnitId] = React.useState(() =>
    guessUnitId(eligibleUnits, unmapped),
  )
  const platformLabel =
    unmapped.platform === "ifood"
      ? "iFood"
      : unmapped.platform === "keeta"
        ? "Keeta"
        : "99 Food"
  const selectedUnit = eligibleUnits.find((u) => u.id === unitId)
  const selectedLabel = selectedUnit
    ? `#${selectedUnit.code} ${selectedUnit.name}`
    : null

  const notifiedRef = React.useRef(false)
  React.useEffect(() => {
    if (state.ok && state.result && !notifiedRef.current) {
      notifiedRef.current = true
      onSuccess(state.result)
    }
  }, [state, onSuccess])

  if (eligibleUnits.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhuma unidade elegível pra vincular (todas já têm {platformLabel}
        ).
        <br />
        Vai pro modo &quot;Criar nova&quot; ou edita em /unidades.
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        fd.set("file", file, file.name)
        formAction(fd)
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="storeId" value={unmapped.storeId} />
      <input type="hidden" name="platform" value={unmapped.platform} />
      <input type="hidden" name="unitId" value={unitId} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Qual unidade é essa?</Label>
        <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Escolha a unidade...">
              {selectedLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {eligibleUnits.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                #{u.code} {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          Aparecem só unidades que ainda não têm ID {platformLabel} vinculado.
        </p>
      </div>

      <div className="rounded-md bg-emerald-50 px-3 py-2.5 text-[11px] dark:bg-emerald-950/30">
        <p className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" />O que vai acontecer
        </p>
        <ul className="mt-1 space-y-0.5 text-emerald-800 dark:text-emerald-400">
          <li>
            • ID {platformLabel}{" "}
            <span className="font-mono font-semibold">
              {unmapped.storeId}
            </span>{" "}
            entra no cadastro da unidade escolhida
          </li>
          <li>• Esse arquivo é processado pra essa unidade</li>
          <li>
            • Próximas importações dessa loja são reconhecidas
            automaticamente
          </li>
        </ul>
      </div>

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {progress && progress.current < progress.total ? "Parar" : "Cancelar"}
        </Button>
        <LinkSubmitButton hasNext={!!progress && progress.current < progress.total} />
      </DialogFooter>
    </form>
  )
}

function LinkSubmitButton({ hasNext }: { hasNext: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Vinculando..."
        : hasNext
          ? "Vincular e ir pra próxima"
          : "Vincular e importar"}
    </Button>
  )
}

// ─── Modo 2: Criar nova unidade ─────────────────────────────────────

function CreateForm({
  unmapped,
  file,
  progress,
  onSuccess,
  onCancel,
  cadastroExigente = false,
}: {
  unmapped: NonNullable<ImportFileResult["unmapped"]>
  file: File
  progress?: { current: number; total: number }
  onSuccess: (result: ImportFileResult) => void
  onCancel: () => void
  cadastroExigente?: boolean
}) {
  const [state, formAction] = useActionState(createUnitAndImport, createInitial)
  const [name, setName] = React.useState(unmapped.suggestedName ?? "")
  const [city, setCity] = React.useState(unmapped.suggestedCity ?? "")
  const [uf, setUf] = React.useState("SP")
  const [cnpj, setCnpj] = React.useState(
    unmapped.cnpj ? maskCnpj(unmapped.cnpj) : "",
  )

  const notifiedRef = React.useRef(false)
  React.useEffect(() => {
    if (state.ok && state.result && !notifiedRef.current) {
      notifiedRef.current = true
      onSuccess(state.result)
    }
  }, [state, onSuccess])

  const platformLabel =
    unmapped.platform === "ifood"
      ? "iFood"
      : unmapped.platform === "keeta"
        ? "Keeta"
        : "99 Food"

  return (
    <form
      action={(fd) => {
        fd.set("file", file, file.name)
        formAction(fd)
      }}
      {...validacaoPtBr}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="storeId" value={unmapped.storeId} />
      <input type="hidden" name="platform" value={unmapped.platform} />

      {/* 2 colunas no desktop — dialog comprido exigia zoom 50% em monitor
          pequeno (feedback de cliente). */}
      <div className="grid gap-4 sm:grid-cols-2">

      <Field label="Nome *">
        <Input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: Loja Centro"
          required
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Cidade *">
            <Input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="ex.: Hortolândia"
              required
            />
          </Field>
        </div>
        <Field label="UF">
          <Select value={uf} onValueChange={(v) => setUf(v ?? "SP")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UFs.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="state" value={uf} />
        </Field>
      </div>

      <Field label={cadastroExigente ? "CNPJ *" : "CNPJ (do relatório)"}>
        <Input
          name="cnpj"
          value={cnpj}
          onChange={(e) => setCnpj(maskCnpj(e.target.value))}
          placeholder="00.000.000/0000-00"
          maxLength={18}
          required={cadastroExigente}
        />
      </Field>

      <Field
        label={
          cadastroExigente
            ? "Inauguração da unidade *"
            : "Inauguração da unidade"
        }
      >
        <Input
          name="data_inauguracao"
          type="date"
          required={cadastroExigente}
        />
      </Field>

      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium">Plataformas ativas</Label>
        <div className="grid grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <PlatformCheckbox
              key={p.id}
              platform={p}
              defaultChecked={p.id === unmapped.platform}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {platformLabel} já vem marcado (foi como descobrimos essa loja).
          Pode ajustar.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`active-${unmapped.storeId}`}
          name="active"
          type="checkbox"
          defaultChecked
          className="size-4 rounded border-border"
        />
        <Label
          htmlFor={`active-${unmapped.storeId}`}
          className="cursor-pointer text-sm font-normal"
        >
          Unidade ativa (recebendo pedidos)
        </Label>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        ID da loja {platformLabel}:{" "}
        <span className="font-mono font-semibold text-foreground">
          {unmapped.storeId}
        </span>{" "}
        vai ser vinculado automaticamente.
      </div>

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {progress && progress.current < progress.total ? "Parar" : "Cancelar"}
        </Button>
        <CreateSubmitButton hasNext={!!progress && progress.current < progress.total} />
      </DialogFooter>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  )
}

function CreateSubmitButton({ hasNext }: { hasNext: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Criando..."
        : hasNext
          ? "Criar e ir pra próxima"
          : "Criar e importar"}
    </Button>
  )
}

function PlatformCheckbox({
  platform,
  defaultChecked,
}: {
  platform: { id: PlatformId; label: string }
  defaultChecked: boolean
}) {
  const [checked, setChecked] = React.useState(defaultChecked)
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
        checked
          ? "border-primary bg-primary/5"
          : "border-border bg-card opacity-60 hover:opacity-100"
      }`}
    >
      <input
        type="checkbox"
        name="platforms"
        value={platform.id}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="size-3.5 rounded border-border"
      />
      <PlatformLogo platform={platform.id} size="sm" />
      <span>{platform.label}</span>
    </label>
  )
}
