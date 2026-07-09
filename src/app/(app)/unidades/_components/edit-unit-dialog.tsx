"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Cable, Calendar, Compass, Pencil, Power, Store } from "lucide-react"

import { CoachTour, type CoachStep } from "@/components/onboarding/coach-tour"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { updateUnit, type CreateUnitState } from "../_actions"
import { UnitLogoUploader } from "./unit-logo-uploader"

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

const initial: CreateUnitState = { ok: false }

/** Passos do "Como funciona" do cadastro/edição da unidade. */
const EDIT_STEPS: CoachStep[] = [
  {
    selector: '[data-tour="u-nome"]',
    icon: <Store className="size-4" />,
    title: "Identificação da loja",
    body: "Nome (como aparece no sistema), cidade e UF. O CNPJ é opcional — serve pra emissão de nota.",
  },
  {
    selector: '[data-tour="u-inauguracao"]',
    icon: <Calendar className="size-4" />,
    title: "Inauguração da unidade",
    body: "É a DATA DE ABERTURA da loja. O sistema ignora os meses antes dela existir — assim a Cobertura não cobra relatório de um período em que a loja nem operava.",
  },
  {
    selector: '[data-tour="u-plataformas"]',
    icon: <Cable className="size-4" />,
    title: "Plataformas e IDs das lojas",
    body: "Marque onde a loja opera e cole o ID dela em cada plataforma (iFood, 99, Keeta). É pelo ID que a importação reconhece a loja automaticamente — sem ele, ela aparece como 'loja desconhecida' na hora de importar.",
  },
  {
    selector: '[data-tour="u-ativa"]',
    icon: <Power className="size-4" />,
    title: "Unidade ativa",
    body: "Marcada = recebendo pedidos e contando nos relatórios. Desmarque se a loja fechou ou pausou.",
  },
]

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export type EditUnitInitial = {
  unitId: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  dataInauguracao: string | null
  dataEncerramento: string | null
  platforms: PlatformId[]
  /** Mapeamento PlatformId → ID da loja na plataforma (iFood: 260777, etc.) */
  externalStoreIds?: Partial<Record<PlatformId, string | null>>
  /** Inauguração por plataforma (override da data da unidade). */
  platformInauguracoes?: Partial<Record<PlatformId, string | null>>
  /** Logo da loja (white-label por unidade). */
  logoUrl?: string | null
}

export function EditUnitDialog({
  unit,
  inline,
}: {
  unit: EditUnitInitial
  inline?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [tourOpen, setTourOpen] = React.useState(false)
  const [state, formAction] = useActionState(updateUnit, initial)
  const [cnpj, setCnpj] = React.useState(unit.cnpj ? maskCnpj(unit.cnpj) : "")
  const [uf, setUf] = React.useState(unit.state ?? "SP")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const trigger = inline ? (
    <button
      type="button"
      aria-label="Editar unidade"
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Pencil className="size-3.5" />
    </button>
  ) : (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      <Pencil className="size-3.5" />
      Editar
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-7">
            <DialogTitle>Editar unidade</DialogTitle>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Compass className="size-3.5" />
              Como funciona
            </button>
          </div>
          <DialogDescription>
            Código <span className="font-mono font-semibold">#{unit.code}</span>
            {" "}— não pode ser alterado.
          </DialogDescription>
        </DialogHeader>

        <UnitLogoUploader
          unitId={unit.unitId}
          unitName={unit.name}
          currentLogo={unit.logoUrl ?? null}
        />

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="unitId" value={unit.unitId} />

          <div data-tour="u-nome">
            <Field label="Nome" error={state.fieldErrors?.name}>
              <Input
                name="name"
                defaultValue={unit.name}
                placeholder="ex.: Loja Centro"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Cidade" error={state.fieldErrors?.city}>
                <Input
                  name="city"
                  defaultValue={unit.city ?? ""}
                  placeholder="ex.: São Paulo"
                  required
                />
              </Field>
            </div>
            <div>
              <Field label="UF" error={state.fieldErrors?.state}>
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
          </div>

          <Field label="CNPJ (opcional)" error={state.fieldErrors?.cnpj}>
            <Input
              name="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              maxLength={18}
            />
          </Field>

          <div data-tour="u-inauguracao" className="grid grid-cols-2 gap-3">
            <Field label="Inauguração da unidade">
              <Input
                name="data_inauguracao"
                type="date"
                defaultValue={unit.dataInauguracao ?? ""}
              />
            </Field>
            <Field label="Encerramento (se fechou)">
              <Input
                name="data_encerramento"
                type="date"
                defaultValue={unit.dataEncerramento ?? ""}
              />
            </Field>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            A inauguração faz a Cobertura ignorar meses antes da loja existir
            (não cobra dado que não tinha como ter).
          </p>

          <div data-tour="u-plataformas" className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Plataformas ativas</Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformCheckbox
                  key={p.id}
                  platform={p}
                  defaultChecked={unit.platforms.includes(p.id)}
                />
              ))}
            </div>
            <PlatformIdsBlock
              externalStoreIds={unit.externalStoreIds ?? {}}
              platformInauguracoes={unit.platformInauguracoes ?? {}}
            />
          </div>

          <div data-tour="u-ativa" className="flex items-center gap-2">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked={unit.active}
              className="size-4 rounded border-border"
            />
            <Label
              htmlFor="active"
              className="cursor-pointer text-sm font-normal"
            >
              Unidade ativa (recebendo pedidos)
            </Label>
          </div>

          {state.message && !state.ok && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>

      <CoachTour
        steps={EDIT_STEPS}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
      />
    </Dialog>
  )
}

function PlatformIdsBlock({
  externalStoreIds,
  platformInauguracoes,
}: {
  externalStoreIds: Partial<Record<PlatformId, string | null>>
  platformInauguracoes: Partial<Record<PlatformId, string | null>>
}) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        IDs das lojas nas plataformas
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <PlatformIdInput
          name="ifoodStoreId"
          label="iFood"
          placeholder="ex.: 260777"
          defaultValue={externalStoreIds.ifood ?? ""}
        />
        <PlatformIdInput
          name="_99foodStoreId"
          label="99 Food"
          placeholder="ID da loja"
          defaultValue={externalStoreIds["99food"] ?? ""}
        />
        <PlatformIdInput
          name="keetaStoreId"
          label="Keeta"
          placeholder="ID da loja"
          defaultValue={externalStoreIds.keeta ?? ""}
        />
      </div>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Inauguração por plataforma (se diferente da loja)
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <PlatformDateInput
          name="ifoodInauguracao"
          label="iFood"
          defaultValue={platformInauguracoes.ifood ?? ""}
        />
        <PlatformDateInput
          name="_99foodInauguracao"
          label="99 Food"
          defaultValue={platformInauguracoes["99food"] ?? ""}
        />
        <PlatformDateInput
          name="keetaInauguracao"
          label="Keeta"
          defaultValue={platformInauguracoes.keeta ?? ""}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        ID = importação automática reconhecer a loja. Inauguração = a Cobertura
        ignora meses antes da loja entrar naquela plataforma.
      </p>
    </div>
  )
}

function PlatformDateInput({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string
}) {
  const [value, setValue] = React.useState(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        name={name}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  )
}

function PlatformIdInput({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string
  label: string
  placeholder: string
  defaultValue: string
}) {
  // Controlled pra evitar warning do Base UI quando o defaultValue chega
  // depois da 1ª render (vem do server). Inicializa com o valor já recebido.
  const [value, setValue] = React.useState(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
    </div>
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

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && (
        <span className="text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar alterações"}
    </Button>
  )
}
