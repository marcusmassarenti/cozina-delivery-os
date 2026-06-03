"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CalendarRange,
  FileDown,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"
import type { Fechamento } from "@/lib/data/fechamentos"
import {
  saveFechamento,
  deleteFechamento,
  prefillRecebido,
} from "../_actions"

type AcertoFields = {
  valorChurrascoPote: number
  paraPibus: number
  descontoCnpao: number
  legumes: number
  vr: number
}

const EMPTY_ACERTO: AcertoFields = {
  valorChurrascoPote: 0,
  paraPibus: 0,
  descontoCnpao: 0,
  legumes: 0,
  vr: 0,
}

type Draft = {
  periodoInicio: string
  periodoFim: string
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  creditoDebito: number
  custoProdutos: number
  custoVinagrete: number
  acerto: AcertoFields
  observacoes: string
}

function emptyDraft(): Draft {
  return {
    periodoInicio: "",
    periodoFim: "",
    recebidoIfood: 0,
    recebidoKeeta: 0,
    recebido99: 0,
    creditoDebito: 0,
    custoProdutos: 0,
    custoVinagrete: 0,
    acerto: { ...EMPTY_ACERTO },
    observacoes: "",
  }
}

function fromFechamento(f: Fechamento): Draft {
  const a = (f.acerto ?? {}) as Partial<AcertoFields>
  return {
    periodoInicio: f.periodoInicio,
    periodoFim: f.periodoFim,
    recebidoIfood: f.recebidoIfood,
    recebidoKeeta: f.recebidoKeeta,
    recebido99: f.recebido99,
    creditoDebito: f.creditoDebito,
    custoProdutos: f.custoProdutos,
    custoVinagrete: f.custoVinagrete,
    acerto: { ...EMPTY_ACERTO, ...a },
    observacoes: f.observacoes ?? "",
  }
}

function fmtPeriodo(ini: string, fim: string): string {
  const d = (s: string) => {
    const [y, m, day] = s.split("-")
    return `${day}/${m}`
  }
  return `${d(ini)} – ${d(fim)}`
}

export function FechamentoTab({
  unitId,
  unitCode,
  fechamentos,
  canEdit,
}: {
  unitId: string
  unitCode: string
  fechamentos: Fechamento[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<Draft>(emptyDraft())
  const [editing, setEditing] = React.useState(false)
  const [isExisting, setIsExisting] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [pulling, setPulling] = React.useState(false)
  const [pulled, setPulled] = React.useState(false)
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const lastPulled = React.useRef("")

  // Puxa o recebido da semana do importado (estimativa).
  const pull = React.useCallback(
    async (ini: string, fim: string) => {
      if (!ini || !fim || fim < ini) return
      lastPulled.current = `${ini}|${fim}`
      setPulling(true)
      const res = await prefillRecebido(unitId, ini, fim)
      setPulling(false)
      if (res.ok && res.data) {
        setDraft((p) => ({
          ...p,
          // iFood guarda por competência (mês) e o depósito defasa ~1 semana —
          // só sobrescreve se veio algo; senão preserva o que foi digitado.
          recebidoIfood:
            res.data!.ifood > 0 ? res.data!.ifood : p.recebidoIfood,
          recebidoKeeta: res.data!.keeta,
          recebido99: res.data!.ninefood,
        }))
        setPulled(true)
      }
    },
    [unitId],
  )

  // Auto-pull ao escolher as duas datas num fechamento NOVO.
  React.useEffect(() => {
    if (isExisting || !editing) return
    const { periodoInicio: ini, periodoFim: fim } = draft
    if (ini && fim && fim >= ini && `${ini}|${fim}` !== lastPulled.current) {
      pull(ini, fim)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.periodoInicio, draft.periodoFim, editing, isExisting])

  const recebido =
    draft.recebidoIfood +
    draft.recebidoKeeta +
    draft.recebido99 +
    draft.creditoDebito
  const lucro = recebido - draft.custoProdutos - draft.custoVinagrete
  const metade = lucro / 2

  function startNew() {
    setDraft(emptyDraft())
    setEditing(true)
    setIsExisting(false)
    setPulled(false)
    lastPulled.current = ""
    setMsg(null)
  }
  function startEdit(f: Fechamento) {
    setDraft(fromFechamento(f))
    setEditing(true)
    setIsExisting(true)
    setPulled(false)
    lastPulled.current = `${f.periodoInicio}|${f.periodoFim}`
    setMsg(null)
  }

  async function onSave() {
    if (!draft.periodoInicio || !draft.periodoFim) {
      setMsg({ ok: false, text: "Escolha o início e o fim da semana." })
      return
    }
    setSaving(true)
    setMsg(null)
    const res = await saveFechamento({
      unitId,
      unitCode,
      periodoInicio: draft.periodoInicio,
      periodoFim: draft.periodoFim,
      recebidoIfood: draft.recebidoIfood,
      recebidoKeeta: draft.recebidoKeeta,
      recebido99: draft.recebido99,
      creditoDebito: draft.creditoDebito,
      custoProdutos: draft.custoProdutos,
      custoVinagrete: draft.custoVinagrete,
      acerto: draft.acerto as unknown as Record<string, unknown>,
      observacoes: draft.observacoes,
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      router.refresh()
    } else {
      setMsg({ ok: false, text: res.message ?? "Erro ao salvar." })
    }
  }

  async function onDelete(id: string) {
    const res = await deleteFechamento(id, unitCode)
    if (res.ok) router.refresh()
    else setMsg({ ok: false, text: res.message ?? "Erro ao apagar." })
  }

  const setNum = (k: keyof Draft, v: number) =>
    setDraft((p) => ({ ...p, [k]: v }))
  const setAcerto = (k: keyof AcertoFields, v: number) =>
    setDraft((p) => ({ ...p, acerto: { ...p.acerto, [k]: v } }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fechamento de sociedade</h3>
          <p className="text-xs text-muted-foreground">
            Acerto 50/50 semanal · você digita os depósitos, o lucro ÷ 2
            calcula sozinho.
          </p>
        </div>
        {canEdit && !editing && (
          <Button onClick={startNew} size="sm">
            <Plus className="mr-1 size-3.5" />
            Novo fechamento
          </Button>
        )}
      </div>

      {/* Formulário */}
      {editing && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {/* Entradas */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início da semana">
                  <Input
                    type="date"
                    value={draft.periodoInicio}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        periodoInicio: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Fim da semana">
                  <Input
                    type="date"
                    value={draft.periodoFim}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, periodoFim: e.target.value }))
                    }
                  />
                </Field>
              </div>

              {draft.periodoInicio && draft.periodoFim && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-[11px]">
                  <span className="text-muted-foreground">
                    {pulling
                      ? "Puxando o recebido da semana..."
                      : pulled
                        ? "≈ 99 e Keeta puxados do importado · iFood você confere/digita (depósito defasa)"
                        : "Dá pra puxar o recebido do que já foi importado"}
                  </span>
                  <button
                    type="button"
                    onClick={() => pull(draft.periodoInicio, draft.periodoFim)}
                    disabled={pulling}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("size-3", pulling && "animate-spin")}
                    />
                    Puxar da semana
                  </button>
                </div>
              )}

              <Bloco titulo="1. Recebido das plataformas">
                <Money label="iFood" value={draft.recebidoIfood} onChange={(n) => setNum("recebidoIfood", n)} />
                <Money label="Keeta" value={draft.recebidoKeeta} onChange={(n) => setNum("recebidoKeeta", n)} />
                <Money label="99 Food" value={draft.recebido99} onChange={(n) => setNum("recebido99", n)} />
                <Money label="Crédito/débito" value={draft.creditoDebito} onChange={(n) => setNum("creditoDebito", n)} allowNegative />
              </Bloco>

              <Bloco titulo="2. Custos da operação">
                <Money label="Produtos (CMV Cozina)" value={draft.custoProdutos} onChange={(n) => setNum("custoProdutos", n)} />
                <Money label="Vinagrete / maionese / bebidas" value={draft.custoVinagrete} onChange={(n) => setNum("custoVinagrete", n)} />
              </Bloco>

              <Bloco titulo="4. Acerto / repasse (manual)">
                <Money label="Valor Churrasco no Pote" value={draft.acerto.valorChurrascoPote} onChange={(n) => setAcerto("valorChurrascoPote", n)} />
                <Money label="Churrasco no Pote p/ Pibus" value={draft.acerto.paraPibus} onChange={(n) => setAcerto("paraPibus", n)} />
                <Money label="Desconto CNPão" value={draft.acerto.descontoCnpao} onChange={(n) => setAcerto("descontoCnpao", n)} />
                <Money label="Legumes" value={draft.acerto.legumes} onChange={(n) => setAcerto("legumes", n)} />
                <Money label="VR" value={draft.acerto.vr} onChange={(n) => setAcerto("vr", n)} />
              </Bloco>

              <Field label="Observações">
                <textarea
                  value={draft.observacoes}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, observacoes: e.target.value }))
                  }
                  rows={2}
                  placeholder="Notas do acerto (ex.: diferença de VR pq iFood reduziu o repasse)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </Field>
            </div>

            {/* Resultado ao vivo */}
            <div className="flex h-fit flex-col gap-2 rounded-lg border bg-muted/30 p-4">
              <Linha label="Recebido" value={recebido} strong />
              <Linha label="(−) Produtos" value={-draft.custoProdutos} muted />
              <Linha label="(−) Vinagrete/bebidas" value={-draft.custoVinagrete} muted />
              <div className="my-1 border-t" />
              <Linha label="Lucro líquido" value={lucro} strong />
              <div className="mt-2 rounded-md bg-primary/10 p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Lucro ÷ 2
                </div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-muted-foreground">JK</div>
                    <div className="font-semibold tabular-nums">{fmtBRL(metade)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Cozina</div>
                    <div className="font-semibold tabular-nums">{fmtBRL(metade)}</div>
                  </div>
                </div>
              </div>

              {msg && (
                <p
                  className={cn(
                    "text-xs",
                    msg.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {msg.text}
                </p>
              )}
              <div className="mt-1 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setMsg(null)
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button onClick={onSave} disabled={saving} size="sm" className="flex-1">
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      {fechamentos.length === 0 && !editing ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Nenhum fechamento ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canEdit
              ? 'Clique em "Novo fechamento" pra registrar a primeira semana.'
              : "Os fechamentos aparecem aqui quando registrados."}
          </p>
        </div>
      ) : (
        fechamentos.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Semana</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recebido</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lucro líq.</th>
                  <th className="px-3 py-2.5 text-right font-medium">÷ 2</th>
                  <th className="w-28 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {fechamentos.map((f) => {
                  const rec =
                    f.recebidoIfood +
                    f.recebidoKeeta +
                    f.recebido99 +
                    f.creditoDebito
                  const luc = rec - f.custoProdutos - f.custoVinagrete
                  return (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarRange className="size-3.5 text-muted-foreground" />
                          {fmtPeriodo(f.periodoInicio, f.periodoFim)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {fmtBRL(rec)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {fmtBRL(luc)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-primary">
                        {fmtBRL(luc / 2)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Link
                            href={`/unidades/${unitCode}/fechamento/${f.id}`}
                            target="_blank"
                            aria-label="Exportar PDF"
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <FileDown className="size-3.5" />
                          </Link>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(f)}
                                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                aria-label="Apagar"
                                onClick={() => onDelete(f.id)}
                                className="flex size-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
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

function Bloco({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

/** Campo de dinheiro: digita números, formata como R$ automaticamente. */
function Money({
  label,
  value,
  onChange,
  allowNegative = false,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  allowNegative?: boolean
}) {
  const display =
    value === 0
      ? ""
      : value.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder="0,00"
        onChange={(e) => {
          const raw = e.target.value
          const neg = allowNegative && raw.trim().startsWith("-")
          const digits = raw.replace(/\D/g, "")
          const cents = parseInt(digits || "0", 10)
          onChange((neg ? -1 : 1) * (cents / 100))
        }}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-ring"
      />
    </label>
  )
}

function Linha({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: number
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "font-semibold",
          muted && "text-muted-foreground",
        )}
      >
        {fmtBRL(value)}
      </span>
    </div>
  )
}
