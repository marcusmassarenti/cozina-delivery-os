"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Link2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fmtNum } from "@/lib/format"

import { vincularUnidadeAction, type VinculoState } from "../_actions"
import type { UnidadeOpcao } from "./conectar-loja"

/** Valor do item "nenhuma": Select não aceita string vazia como value. */
const SEM_UNIDADE = "__nenhuma__"

function Salvar({ mudou }: { mudou: boolean }) {
  const { pending } = useFormStatus()
  if (!mudou) return null
  return (
    <Button type="submit" size="sm" disabled={pending} className="h-8">
      <Check className="size-3.5" />
      {pending ? "Salvando..." : "Salvar"}
    </Button>
  )
}

/**
 * Escolhe a que unidade a loja do Cardápio Web pertence, depois de conectada.
 *
 * Antes isso só dava pra fazer na hora de conectar. Quem deixasse em "escolher
 * depois" ficava sem saída pela tela — e o histórico já importado seguia sem
 * dono, invisível em qualquer visão por loja.
 */
export function VinculoUnidade({
  installId,
  unidades,
  unitIdAtual,
}: {
  installId: string
  unidades: UnidadeOpcao[]
  unitIdAtual: string | null
}) {
  const [state, action] = useActionState<VinculoState, FormData>(
    vincularUnidadeAction,
    { ok: false },
  )
  const [sel, setSel] = React.useState(unitIdAtual ?? SEM_UNIDADE)

  // Depois de salvar, o servidor revalida e manda o vínculo novo por prop.
  // Ajustar durante o render (e não num effect) é o padrão do React pra
  // estado que segue uma prop: evita o flash de um render com o valor velho.
  const [visto, setVisto] = React.useState(unitIdAtual)
  if (visto !== unitIdAtual) {
    setVisto(unitIdAtual)
    setSel(unitIdAtual ?? SEM_UNIDADE)
  }

  const atual = unitIdAtual ?? SEM_UNIDADE
  const mudou = sel !== atual
  const r = state.reassociados
  const total = r ? r.pedidos + r.catalogo + r.clientes : 0

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="install_id" value={installId} />
      <input
        type="hidden"
        name="unit_id"
        value={sel === SEM_UNIDADE ? "" : sel}
      />

      <Link2 className="size-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Unidade:</span>

      <Select value={sel} onValueChange={(v) => setSel(v ?? SEM_UNIDADE)}>
        <SelectTrigger className="h-8 w-60 text-xs">
          {/* Base UI mostra o VALUE cru sem esta função — apareceria o uuid. */}
          <SelectValue>
            {(v) => {
              const u = unidades.find((x) => x.id === v)
              return u ? `#${u.code} · ${u.name}` : "Sem unidade"
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_UNIDADE}>Sem unidade</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              #{u.code} · {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Salvar mudou={mudou} />

      {state.ok && !mudou && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" />
          {total > 0
            ? `vínculo salvo · ${fmtNum(total)} registros do histórico foram junto`
            : "vínculo salvo"}
        </span>
      )}

      {!state.ok && state.message && (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          {state.message}
        </span>
      )}
    </form>
  )
}
