"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarRange, FileDown, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"
import type { Fechamento, RecebidoSemana } from "@/lib/data/fechamentos"
import {
  type Acerto,
  type AcertoMode,
  EMPTY_ACERTO,
  toAcerto,
  recebidoTotal,
  lucroLiquido,
  computeSplit,
  acertoBreakdown,
} from "@/lib/fechamento-calc"
import {
  saveFechamento,
  deleteFechamento,
  prefillRecebido,
} from "../_actions"

type Draft = {
  periodoInicio: string
  periodoFim: string
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  vr: number
  custoProdutos: number
  custoVinagrete: number
  acerto: Acerto
  observacoes: string
}

function emptyDraft(): Draft {
  return {
    periodoInicio: "",
    periodoFim: "",
    recebidoIfood: 0,
    recebidoKeeta: 0,
    recebido99: 0,
    vr: 0,
    custoProdutos: 0,
    custoVinagrete: 0,
    acerto: { ...EMPTY_ACERTO },
    observacoes: "",
  }
}

function fromFechamento(f: Fechamento): Draft {
  return {
    periodoInicio: f.periodoInicio,
    periodoFim: f.periodoFim,
    recebidoIfood: f.recebidoIfood,
    recebidoKeeta: f.recebidoKeeta,
    recebido99: f.recebido99,
    vr: f.vr,
    custoProdutos: f.custoProdutos,
    custoVinagrete: f.custoVinagrete,
    acerto: toAcerto(f.acerto),
    observacoes: f.observacoes ?? "",
  }
}

function fmtPeriodo(ini: string, fim: string): string {
  const d = (s: string) => {
    const [, m, day] = s.split("-")
    return `${day}/${m}`
  }
  return `${d(ini)} – ${d(fim)}`
}

/** Segunda-feira da semana de `dateStr` (YYYY-MM-DD). */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=dom .. 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
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
  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(
    null,
  )
  // Referência cinza: soma do importado na semana (NÃO preenche os campos).
  const [imported, setImported] = React.useState<RecebidoSemana | null>(null)
  const [pulling, setPulling] = React.useState(false)
  const lastPulled = React.useRef("")

  // Ao ter as duas datas, busca o importado da semana só pra conferência.
  React.useEffect(() => {
    const { periodoInicio: ini, periodoFim: fim } = draft
    if (!editing || !ini || !fim || fim < ini) {
      setImported(null)
      return
    }
    const key = `${ini}|${fim}`
    if (key === lastPulled.current) return
    lastPulled.current = key
    setPulling(true)
    prefillRecebido(unitId, ini, fim).then((res) => {
      setPulling(false)
      setImported(res.ok && res.data ? res.data : null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.periodoInicio, draft.periodoFim, editing])

  const rc = {
    recebidoIfood: draft.recebidoIfood,
    recebidoKeeta: draft.recebidoKeeta,
    recebido99: draft.recebido99,
    vr: draft.vr,
    custoProdutos: draft.custoProdutos,
    custoVinagrete: draft.custoVinagrete,
  }
  const recebido = recebidoTotal(rc)
  const lucro = lucroLiquido(rc)
  const split = computeSplit(lucro, draft.custoVinagrete, draft.acerto)
  const acertoLines = acertoBreakdown(draft.acerto)

  function startNew() {
    setDraft(emptyDraft())
    setEditing(true)
    setImported(null)
    lastPulled.current = ""
    setMsg(null)
  }
  function startEdit(f: Fechamento) {
    setDraft(fromFechamento(f))
    setEditing(true)
    setImported(null)
    lastPulled.current = ""
    setMsg(null)
  }

  // Escolher o início trava a semana em segunda → domingo.
  function setInicio(value: string) {
    if (!value) {
      setDraft((p) => ({ ...p, periodoInicio: "", periodoFim: "" }))
      return
    }
    const seg = mondayOf(value)
    setDraft((p) => ({ ...p, periodoInicio: seg, periodoFim: addDays(seg, 6) }))
  }

  async function onSave() {
    if (!draft.periodoInicio || !draft.periodoFim) {
      setMsg({ ok: false, text: "Escolha a semana." })
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
      vr: draft.vr,
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
  const setAcerto = <K extends keyof Acerto>(k: K, v: Acerto[K]) =>
    setDraft((p) => ({ ...p, acerto: { ...p.acerto, [k]: v } }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fechamento de sociedade</h3>
          <p className="text-xs text-muted-foreground">
            Acerto 50/50 semanal (segunda a domingo) · você digita os depósitos,
            o lucro ÷ 2 e os acertos calculam sozinhos.
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
                <Field label="Início da semana (segunda)">
                  <Input
                    type="date"
                    value={draft.periodoInicio}
                    onChange={(e) => setInicio(e.target.value)}
                  />
                </Field>
                <Field label="Fim da semana (domingo)">
                  <Input
                    type="date"
                    value={draft.periodoFim}
                    readOnly
                    disabled
                    className="opacity-70"
                  />
                </Field>
              </div>
              <p className="-mt-2 text-[10px] text-muted-foreground">
                A semana é sempre segunda → domingo. Escolha a segunda e o
                domingo é preenchido automático.
              </p>

              {(pulling || imported) && (
                <p className="text-[10px] text-muted-foreground">
                  {pulling
                    ? "Conferindo o importado da semana..."
                    : "Em cinza: total importado da semana (≈ vendas, não o depósito) — clique pra usar. O valor que vale é o depósito que você digita."}
                </p>
              )}
              <Bloco titulo="1. Recebido das plataformas">
                <Money label="iFood" value={draft.recebidoIfood} onChange={(n) => setNum("recebidoIfood", n)} reference={imported?.ifood ?? null} />
                <Money label="Keeta" value={draft.recebidoKeeta} onChange={(n) => setNum("recebidoKeeta", n)} reference={imported?.keeta ?? null} />
                <Money label="99 Food" value={draft.recebido99} onChange={(n) => setNum("recebido99", n)} reference={imported?.ninefood ?? null} />
                <Money label="VR (desc. do iFood)" value={draft.vr} onChange={(n) => setNum("vr", n)} />
              </Bloco>
              <p className="-mt-2 text-[10px] text-muted-foreground">
                iFood/Keeta/99 = recebido da loja (já sem o VR). O VR vai no
                campo VR e volta a somar no lucro.
              </p>

              <Bloco titulo="2. Custos da operação">
                <Money label="Produtos (CMV Cozina)" value={draft.custoProdutos} onChange={(n) => setNum("custoProdutos", n)} />
                <Money label="Vinagrete / maionese / bebidas" value={draft.custoVinagrete} onChange={(n) => setNum("custoVinagrete", n)} />
              </Bloco>

              {/* Bloco 4 — acerto / repasse */}
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  4. Acerto / repasse (manual)
                </div>

                {/* CNPão + B2B: somam Cozina, descontam JK */}
                <div className="grid grid-cols-2 gap-2">
                  <Money label="Desc. Churrasco no Pão" value={draft.acerto.cnpao} onChange={(n) => setAcerto("cnpao", n)} />
                  <Money label="Vendas B2B" value={draft.acerto.b2b} onChange={(n) => setAcerto("b2b", n)} />
                </div>
                <p className="-mt-1 text-[10px] text-muted-foreground">
                  CNPão e B2B somam pra parte da Cozina e descontam do JK.
                </p>

                {/* Custos compartilhados com modo */}
                <SharedCost
                  label="Luz"
                  value={draft.acerto.luz}
                  mode={draft.acerto.luzMode}
                  onValue={(n) => setAcerto("luz", n)}
                  onMode={(m) => setAcerto("luzMode", m)}
                />
                <SharedCost
                  label="Guarda"
                  value={draft.acerto.guarda}
                  mode={draft.acerto.guardaMode}
                  onValue={(n) => setAcerto("guarda", n)}
                  onMode={(m) => setAcerto("guardaMode", m)}
                />
                <SharedCost
                  label="Outros"
                  value={draft.acerto.outros}
                  mode={draft.acerto.outrosMode}
                  onValue={(n) => setAcerto("outros", n)}
                  onMode={(m) => setAcerto("outrosMode", m)}
                  obs={draft.acerto.outrosObs}
                  onObs={(t) => setAcerto("outrosObs", t)}
                />
                <p className="-mt-1 text-[10px] text-muted-foreground">
                  Luz / Guarda / Outros: <b>Dividir</b> = cada um paga metade ·{" "}
                  <b>Reembolsar JK</b> = ele já pagou tudo, a Cozina devolve a
                  parte dela (JK recebe a mais).
                </p>
              </div>

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
              <Linha label="Recebido (com VR)" value={recebido} strong />
              <Linha label="(−) Produtos" value={-draft.custoProdutos} muted />
              <Linha label="(−) Vinagrete/bebidas" value={-draft.custoVinagrete} muted />
              <div className="my-1 border-t" />
              <Linha label="Lucro líquido" value={lucro} strong />
              <Linha label="Lucro ÷ 2" value={split.half} muted />
              {draft.custoVinagrete > 0 && (
                <Linha
                  label="+ Vinagrete (volta pro JK)"
                  value={draft.custoVinagrete}
                  muted
                />
              )}

              {acertoLines.length > 0 && (
                <div className="mt-1 flex flex-col gap-1 rounded-md border border-dashed bg-background/60 p-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Acertos
                  </div>
                  {acertoLines.map((l) => (
                    <div
                      key={l.key}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-muted-foreground">{l.label}</span>
                      <span className="tabular-nums">
                        JK {signed(l.jk)} · Coz {signed(l.cozina)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1 rounded-md bg-primary/10 p-3">
                <div className="text-[11px] font-medium text-muted-foreground">
                  A acertar (final)
                </div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-muted-foreground">JK</div>
                    <div className="font-semibold tabular-nums">{fmtBRL(split.jk)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Cozina</div>
                    <div className="font-semibold tabular-nums">{fmtBRL(split.cozina)}</div>
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
                  <th className="px-3 py-2.5 text-right font-medium">JK / Cozina</th>
                  <th className="w-28 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {fechamentos.map((f) => {
                  const rec = recebidoTotal({
                    recebidoIfood: f.recebidoIfood,
                    recebidoKeeta: f.recebidoKeeta,
                    recebido99: f.recebido99,
                    vr: f.vr,
                    custoProdutos: f.custoProdutos,
                    custoVinagrete: f.custoVinagrete,
                  })
                  const luc = lucroLiquido({
                    recebidoIfood: f.recebidoIfood,
                    recebidoKeeta: f.recebidoKeeta,
                    recebido99: f.recebido99,
                    vr: f.vr,
                    custoProdutos: f.custoProdutos,
                    custoVinagrete: f.custoVinagrete,
                  })
                  const s = computeSplit(luc, f.custoVinagrete, toAcerto(f.acerto))
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
                        {fmtBRL(s.jk)} / {fmtBRL(s.cozina)}
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

function signed(n: number): string {
  const s = fmtBRL(Math.abs(n))
  return n < 0 ? `−${s}` : `+${s}`
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

/** Custo compartilhado: valor + toggle dividir/reembolsar (+ obs opcional). */
function SharedCost({
  label,
  value,
  mode,
  onValue,
  onMode,
  obs,
  onObs,
}: {
  label: string
  value: number
  mode: AcertoMode
  onValue: (n: number) => void
  onMode: (m: AcertoMode) => void
  obs?: string
  onObs?: (t: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-input/60 bg-background/40 p-2">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Money label={label} value={value} onChange={onValue} />
        <ModeToggle value={mode} onChange={onMode} />
      </div>
      {onObs && (
        <input
          type="text"
          value={obs ?? ""}
          onChange={(e) => onObs(e.target.value)}
          placeholder="Observação (o que é esse 'outros')"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
        />
      )}
    </div>
  )
}

function ModeToggle({
  value,
  onChange,
}: {
  value: AcertoMode
  onChange: (m: AcertoMode) => void
}) {
  const opt = (m: AcertoMode, txt: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      className={cn(
        "rounded px-2 py-1 text-[10px] font-medium transition-colors",
        value === m
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {txt}
    </button>
  )
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">Tratamento</span>
      <div className="flex rounded-md border border-input p-0.5">
        {opt("dividir", "Dividir")}
        {opt("reembolsar", "Reemb. JK")}
      </div>
    </div>
  )
}

/** Campo de dinheiro: digita números, formata como R$ automaticamente. */
function Money({
  label,
  value,
  onChange,
  allowNegative = false,
  reference = null,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  allowNegative?: boolean
  /** Valor importado da semana — mostrado em cinza só pra conferência. */
  reference?: number | null
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
      {reference != null && reference > 0 && (
        <button
          type="button"
          onClick={() => onChange(reference)}
          title="Usar este valor importado"
          className="text-right text-[9px] text-muted-foreground/70 transition-colors hover:text-primary"
        >
          importado:{" "}
          {reference.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          · usar
        </button>
      )}
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
