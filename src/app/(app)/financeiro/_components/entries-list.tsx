"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Hourglass,
  MoreHorizontal,
  Pencil,
  Search,
  ThumbsUp,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount, FinCategory, FinContact, FinEntry } from "@/lib/data/caixa"

import {
  bulkCategorize,
  bulkDelete,
  bulkMarkPaid,
  convertToTransfer,
  deleteEntry,
  duplicateEntryToday,
  toggleEntryPaid,
} from "../_actions"
import { FinIcon } from "./fin-icon"
import { LancamentoModal } from "./lancamento-dialog"

const STATUS = {
  efetivado: { label: "Confirmado", cls: "text-emerald-600", Icon: CheckCircle2 },
  atrasado: { label: "Atrasado", cls: "text-rose-600", Icon: TriangleAlert },
  pendente: { label: "Pendente", cls: "text-gray-400", Icon: Hourglass },
} as const

function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}

/** Cor do valor: pendente = cinza · despesa paga = vermelho · receita recebida = verde. */
function valueColor(e: FinEntry): string {
  if (e.status !== "efetivado") return "text-gray-400"
  if (e.kind === "despesa") return "text-rose-600"
  if (e.kind === "receita") return "text-emerald-600"
  return "text-sky-600"
}

export function EntriesList({
  entries,
  categories,
  accounts,
  contacts = [],
  units = [],
}: {
  entries: FinEntry[]
  categories: FinCategory[]
  accounts: FinAccount[]
  contacts?: FinContact[]
  units?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<FinEntry | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

  // filtros
  const [search, setSearch] = useState("")
  const [tipo, setTipo] = useState("")
  const [contaId, setContaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [tag, setTag] = useState("")
  const [valorMin, setValorMin] = useState("")

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const allTags = useMemo(
    () => [...new Set(entries.flatMap((e) => e.tags))].sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = parseFloat(valorMin.replace(",", ".")) || 0
    return entries.filter((e) => {
      if (tipo && e.kind !== tipo) return false
      if (contaId && e.accountId !== contaId) return false
      if (categoriaId && e.categoryId !== categoriaId) return false
      if (tag && !e.tags.includes(tag)) return false
      if (min && e.value < min) return false
      if (q) {
        const hay = [e.titular, e.description, e.categoryId ? catById.get(e.categoryId)?.name : ""]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entries, search, tipo, contaId, categoriaId, tag, valorMin, catById])

  /* Agrupa por DIA, na ordem do extrato (mais recente primeiro).
   *
   * Uma lista corrida de 338 lançamentos não tem onde a vista descansar: sem a
   * quebra por data, "vence 06/08" vira texto miúdo repetido em toda linha e a
   * pessoa lê a data de cada uma pra saber onde está. Com o cabeçalho, a data
   * é lida uma vez por bloco.
   *
   * A chave é `dueDate` (a data que a tela promete), com quem não tem data num
   * grupo próprio no fim — em vez de sumir ou fingir que é hoje.
   */
  const grupos = useMemo(() => {
    const porDia = new Map<string, FinEntry[]>()
    for (const e of filtered) {
      const dia = e.dueDate ?? "sem-data"
      const arr = porDia.get(dia) ?? []
      arr.push(e)
      porDia.set(dia, arr)
    }
    return [...porDia.entries()].sort((a, b) => {
      if (a[0] === "sem-data") return 1
      if (b[0] === "sem-data") return -1
      return b[0].localeCompare(a[0])
    })
  }, [filtered])

  const selEntries = entries.filter((e) => selected.has(e.id))
  const totals = useMemo(() => {
    const t = { pagas: 0, aPagar: 0, recebidas: 0, aReceber: 0, transf: 0 }
    for (const e of selEntries) {
      const ok = e.status === "efetivado"
      if (e.kind === "transferencia") t.transf += e.value
      else if (e.kind === "despesa") ok ? (t.pagas += e.value) : (t.aPagar += e.value)
      else if (e.kind === "receita") ok ? (t.recebidas += e.value) : (t.aReceber += e.value)
    }
    return { ...t, saldo: t.recebidas + t.aReceber - t.pagas - t.aPagar }
  }, [selEntries])

  function act(fn: () => Promise<{ ok: boolean }>, clearSel = false) {
    start(async () => {
      await fn()
      if (clearSel) setSelected(new Set())
      setBulkOpen(false)
      router.refresh()
    })
  }
  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((e) => e.id)))
  }
  const ids = [...selected]

  return (
    <div className="flex flex-col gap-3">
      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={chip}>
          <option value="">Tipo: todos</option>
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
          <option value="transferencia">Transferência</option>
        </select>
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={chip}>
          <option value="">Contas: todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={chip}>
          <option value="">Categorias: todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? "↳ " : ""}
              {c.name}
            </option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={chip}>
            <option value="">Tags: todas</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <input
          value={valorMin}
          onChange={(e) => setValorMin(e.target.value)}
          inputMode="decimal"
          placeholder="Valor ≥"
          className={`${chip} w-24`}
        />
        <div className="relative ml-auto min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, fornecedor, descrição"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Barra de seleção / ação em lote */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} selecionado(s)</span>
          <span className="text-rose-600">pagas {fmtBRL(totals.pagas)}</span>
          <span className="text-amber-600">a pagar {fmtBRL(totals.aPagar)}</span>
          <span className="text-emerald-600">recebidas {fmtBRL(totals.recebidas)}</span>
          <span className="text-emerald-500">a receber {fmtBRL(totals.aReceber)}</span>
          <span className="text-sky-600">transf. {fmtBRL(totals.transf)}</span>
          <span className={`font-semibold ${totals.saldo < 0 ? "text-rose-600" : "text-emerald-600"}`}>
            saldo {fmtBRL(totals.saldo)}
          </span>
          <div className="relative ml-auto">
            <button
              onClick={() => setBulkOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Ação em lote <ChevronDown className="size-4" />
            </button>
            {bulkOpen && (
              <div className="absolute right-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border bg-card py-1 shadow-xl">
                <MenuItem onClick={() => act(() => bulkMarkPaid(ids, true), true)}>
                  ✅ Marcar como Pago
                </MenuItem>
                <MenuItem onClick={() => act(() => bulkMarkPaid(ids, false), true)}>
                  ⏳ Marcar como Pendente
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    if (confirm(`Excluir ${ids.length} lançamento(s)?`)) act(() => bulkDelete(ids), true)
                  }}
                >
                  🗑️ Excluir selecionados
                </MenuItem>
                <div className="my-1 border-t" />
                {categories.map((c) => (
                  <MenuItem key={c.id} onClick={() => act(() => bulkCategorize(ids, c.id), true)}>
                    <FinIcon name={c.icon} className="size-3.5 text-muted-foreground" />
                    Categorizar → {c.parentId ? "↳ " : ""}
                    {c.name}
                  </MenuItem>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setSelected(new Set())} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Limpar
          </button>
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento {entries.length ? "com esses filtros" : "neste período"}.
        </div>
      ) : (
        <div className="space-y-5">
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-primary" />
            Selecionar todos ({filtered.length})
          </label>
          {grupos.map(([dia, doDia]) => (
          <div key={dia} className="space-y-1.5">
            {/* Cabeçalho do dia: a data sai de cada linha e aparece uma vez,
                com o total do bloco — é a pergunta que se faz olhando um dia
                ("quanto entrou/saiu nesse dia?") e que antes exigia somar. */}
            <div className="flex items-baseline justify-between gap-2 px-1">
              <span className="text-xs text-muted-foreground">
                {dia === "sem-data" ? "Sem data" : fmtDiaCurto(dia)}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {totalDoDia(doDia) >= 0 ? "+" : "−"}
                {fmtBRL(Math.abs(totalDoDia(doDia)))}
              </span>
            </div>
          {doDia.map((e) => {
            const cat = e.categoryId ? catById.get(e.categoryId) : null
            const acc = e.accountId ? accById.get(e.accountId) : null
            const st = STATUS[e.status]
            const isDespesa = e.kind === "despesa"
            const isTransfer = e.kind === "transferencia"
            return (
              <div
                key={e.id}
                /* A LINHA INTEIRA carrega a cor do tipo — verde entra, vermelho
                   sai. Antes só o valor e o ícone eram coloridos, e num extrato
                   de 43 linhas quase todas positivas o olho tinha que ler o
                   sinal de cada uma pra achar as três saídas. Tom bem fraco de
                   propósito: o que precisa saltar é a exceção, não o padrão. */
                className={`flex items-center gap-3 rounded-xl border-l-[3px] px-4 py-2.5 transition-colors ${
                  isTransfer
                    ? "border-l-sky-400 bg-sky-50/60 hover:bg-sky-50 dark:bg-sky-950/20 dark:hover:bg-sky-950/30"
                    : isDespesa
                      ? "border-l-rose-400 bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/30"
                      : "border-l-emerald-400 bg-emerald-50/60 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggleSel(e.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <button type="button" onClick={() => setEditing(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {/* Ícone em círculo neutro: a cor do tipo já está na linha,
                      e repeti-la aqui deixava três vermelhos empilhados. */}
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
                    <FinIcon name={cat?.icon ?? null} className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight">
                      {e.titular || e.description || cat?.name || "Lançamento"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-muted-foreground">
                      <span>{cat?.name ?? (isTransfer ? "Transferência" : "Sem categoria")}</span>
                      {acc && <span>· {acc.name}</span>}
                      {e.installmentTotal && e.installmentTotal > 1 && (
                        <span className="font-semibold text-foreground">
                          · Parcela {e.installmentNo}/{e.installmentTotal}
                        </span>
                      )}
                      <span>· vence {fmtDate(e.dueDate)}</span>
                    </div>
                  </div>
                </button>

                {/* Valor e situação empilhados, como no ERP: são a mesma
                    pergunta ("quanto, e já saiu do caixa?") e ficavam separados
                    por toda a largura da linha. */}
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-semibold tabular-nums ${valueColor(e)}`}>
                    {isDespesa ? "−" : isTransfer ? "" : "+"}
                    {fmtBRL(e.value)}
                  </div>
                  <div className={`flex items-center justify-end gap-1 text-[11px] ${st.cls}`}>
                    <st.Icon className="size-3" />
                    {st.label}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {/* Joia: confirma o lançamento. Cheia e verde = confirmado,
                      vazada e cinza = pendente — o estado é o próprio botão,
                      então clicar e desfazer é o mesmo gesto. */}
                  <button
                    type="button"
                    disabled={pending}
                    title={
                      e.status === "efetivado"
                        ? "Confirmado — clique para voltar a pendente"
                        : "Confirmar"
                    }
                    aria-pressed={e.status === "efetivado"}
                    onClick={() => act(() => toggleEntryPaid(e.id, e.status !== "efetivado"))}
                    className={`rounded-md p-1.5 transition-colors hover:bg-accent disabled:opacity-50 ${
                      e.status === "efetivado"
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    <ThumbsUp
                      className="size-4"
                      fill={e.status === "efetivado" ? "currentColor" : "none"}
                    />
                  </button>
                  <MenuLinha
                    disabled={pending}
                    onEditar={() => setEditing(e)}
                    onDuplicar={() => act(() => duplicateEntryToday(e.id))}
                    onTransferir={
                      // Só faz sentido com outra conta pra onde mandar.
                      accounts.length > 1
                        ? (destino) => act(() => convertToTransfer(e.id, destino))
                        : undefined
                    }
                    contasDestino={accounts.filter((a) => a.id !== e.accountId)}
                    onExcluir={() => {
                      if (confirm("Excluir este lançamento?")) act(() => deleteEntry(e.id))
                    }}
                  />
                </div>
              </div>
            )
          })}
          </div>
          ))}
        </div>
      )}

      {editing && (
        <LancamentoModal
          entry={editing}
          accounts={accounts}
          categories={categories}
          contacts={contacts}
          units={units}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

const chip =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

/** "08/08/26" — mesmo formato do ERP do Marcus, curto e discreto. */
function fmtDiaCurto(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
}

/** Saldo do dia: entra positivo, sai negativo. Transferência não conta —
 *  é dinheiro trocando de bolso, não resultado. */
function totalDoDia(es: FinEntry[]): number {
  return es.reduce((s, e) => {
    if (e.kind === "transferencia") return s
    return e.kind === "despesa" ? s - e.value : s + e.value
  }, 0)
}

/**
 * Menu de três pontos da linha.
 *
 * "Converter em transferência" abre um segundo nível com as contas: sem saber
 * o DESTINO a conversão não tem como acontecer, e um modal só pra escolher uma
 * conta seria pesado pra uma ação que se usa conciliando dezenas de linhas.
 */
function MenuLinha({
  disabled,
  onEditar,
  onDuplicar,
  onTransferir,
  contasDestino,
  onExcluir,
}: {
  disabled?: boolean
  onEditar: () => void
  onDuplicar: () => void
  onTransferir?: (destinoId: string) => void
  contasDestino: FinAccount[]
  onExcluir: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [escolhendoConta, setEscolhendoConta] = useState(false)

  function fechar() {
    setAberto(false)
    setEscolhendoConta(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        title="Mais ações"
        onClick={() => setAberto((v) => !v)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {aberto && (
        <>
          {/* Camada invisível que fecha ao clicar fora — sem ela o menu fica
              preso aberto e o usuário clica em outra linha achando que fechou. */}
          <div className="fixed inset-0 z-40" onClick={fechar} />
          <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
            {escolhendoConta && onTransferir ? (
              <>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Transferir para
                </p>
                {contasDestino.map((c) => (
                  <MenuItem
                    key={c.id}
                    onClick={() => {
                      onTransferir(c.id)
                      fechar()
                    }}
                  >
                    <ArrowLeftRight className="size-4 text-muted-foreground" />
                    {c.name}
                  </MenuItem>
                ))}
              </>
            ) : (
              <>
                <MenuItem onClick={() => { onEditar(); fechar() }}>
                  <Pencil className="size-4 text-muted-foreground" />
                  Editar
                </MenuItem>
                <MenuItem onClick={() => { onDuplicar(); fechar() }}>
                  <Copy className="size-4 text-muted-foreground" />
                  Duplicar para hoje
                </MenuItem>
                {onTransferir && contasDestino.length > 0 && (
                  <MenuItem onClick={() => setEscolhendoConta(true)}>
                    <ArrowLeftRight className="size-4 text-muted-foreground" />
                    Converter em transferência
                  </MenuItem>
                )}
                <div className="my-1 border-t" />
                <MenuItem onClick={() => { onExcluir(); fechar() }}>
                  <Trash2 className="size-4 text-rose-600" />
                  <span className="text-rose-600">Excluir</span>
                </MenuItem>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
    >
      {children}
    </button>
  )
}
