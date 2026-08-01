"use client"

import { DadosDaUnidade, OperacaoDaUnidade } from "@/components/unidades/dados-da-unidade"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampoCnpj } from "@/components/unidades/campo-cnpj"
import { TIPOS_COZINHA, TIPOS_OPERACAO } from "@/lib/unidade-perfil"
import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import {
  PlatformLogo,
  type CanalId,
  type PlatformId,
} from "@/components/platform-logo"
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
import { validacaoPtBr } from "@/components/shared/form-validacao-ptbr"
import { createUnit, type CreateUnitState } from "../_actions"

const UFs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

const PLATFORMS: { id: CanalId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
  { id: "cardapioweb", label: "Cardápio Web" },
]

const initial: CreateUnitState = { ok: false }

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export function NewUnitDialog({
  cadastroExigente,
}: {
  /** Cliente SaaS: CNPJ + inauguração + plataforma obrigatórios. */
  cadastroExigente?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState(createUnit, initial)
  const [cnpj, setCnpj] = React.useState("")
  const [uf, setUf] = React.useState("SP")
  // Preenchida pela Receita quando o CNPJ é consultado; editável sempre.
  const [cidade, setCidade] = React.useState("")
  const router = useRouter()

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      setCnpj("")
      setUf("SP")
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Nova Unidade
          </button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-6rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova unidade</DialogTitle>
          <DialogDescription>
            Cadastre uma loja da sua operação. O código é gerado
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          {...validacaoPtBr}
          className="flex flex-col gap-3"
        >
          {/* Duas abas: o cadastro que quase não muda de um lado, o que muda
              toda semana do outro. Juntos, o CNPJ ficava soterrado embaixo de
              campo técnico de plataforma — e foi assim que 18 unidades
              chegaram sem CNPJ nenhum. */}
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados da unidade</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="pt-3">
              <DadosDaUnidade
                erroCnpj={state.fieldErrors?.cnpj}
                cidade={cidade}
                onCidade={setCidade}
              />
              <input type="hidden" name="state" value={uf} />
              <div className="mt-3 w-32">
                <label className="text-xs font-medium">UF</label>
                <Select value={uf} onValueChange={(v) => setUf(v ?? "SP")}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UFs.map((u: string) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="operacao" className="pt-3">
              <OperacaoDaUnidade>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium">
                      Inauguração{cadastroExigente ? " *" : ""}
                    </label>
                    <Input
                      className="mt-1"
                      name="data_inauguracao"
                      type="date"
                      required={cadastroExigente}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">
                      Encerramento (se fechou)
                    </label>
                    <Input className="mt-1" name="data_encerramento" type="date" />
                  </div>
                </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">
              {cadastroExigente ? "Plataformas ativas *" : "Plataformas ativas"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformCheckbox key={p.id} platform={p} />
              ))}
            </div>
            {state.fieldErrors?.platforms && (
              <p className="text-[11px] text-rose-600">
                {state.fieldErrors.platforms}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Marque as plataformas onde essa loja opera. Pode mudar depois.
            </p>
          </div>


          <div className="flex items-center gap-2">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked
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


              </OperacaoDaUnidade>
            </TabsContent>
          </Tabs>

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
    </Dialog>
  )
}

function PlatformCheckbox({
  platform,
}: {
  platform: { id: CanalId; label: string }
}) {
  const [checked, setChecked] = React.useState(true)
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
      {pending ? "Salvando..." : "Criar unidade"}
    </Button>
  )
}
