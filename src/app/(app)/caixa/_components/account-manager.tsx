"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount } from "@/lib/data/caixa"

import { deleteAccount, saveAccount, uploadLogo } from "../_actions"
import { BANKS, BANK_SLUGS, BankBadge } from "./bank-badge"

const CORES = [
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#f97316",
  "#ec4899",
  "#ef4444",
  "#06b6d4",
  "#eab308",
]
const KINDS = [
  { v: "conta_corrente", l: "Conta Corrente" },
  { v: "dinheiro", l: "Dinheiro" },
  { v: "outro", l: "Outro" },
]

export function AccountManager({ accounts }: { accounts: FinAccount[]; mode?: "conta" | "cartao" }) {
  const [editing, setEditing] = useState<FinAccount | "new" | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function remove(id: string) {
    if (!confirm("Excluir conta?")) return
    start(async () => {
      await deleteAccount(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Contas Bancárias</h2>
          <p className="text-sm text-muted-foreground">Contas, dinheiro e carteiras.</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Nova conta
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.length === 0 && (
          <div className="col-span-full rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma conta cadastrada.
          </div>
        )}
        {accounts.map((a) => {
          const s = a.stats ?? { pagas: 0, aPagar: 0, recebidas: 0, aReceber: 0, count: 0 }
          const bal = a.balance ?? a.initialBalance
          return (
            <div key={a.id} className="group rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <BankBadge bank={a.bank} logoUrl={a.logoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {KINDS.find((k) => k.v === a.kind)?.l ?? "Conta"}
                    {a.excludeFromTotal ? " · fora do saldo geral" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => setEditing(a)} className="rounded p-1 hover:bg-accent" title="Editar">
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => remove(a.id)} disabled={pending} className="rounded p-1 hover:bg-accent" title="Excluir">
                    <Trash2 className="size-3.5 text-rose-500" />
                  </button>
                </div>
              </div>

              <div className={`mt-3 text-2xl font-bold tabular-nums ${bal < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {fmtBRL(bal)}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3 text-[11px]">
                <Stat icon={ArrowDownRight} cls="text-rose-600" label="pagas" v={s.pagas} />
                <Stat icon={ArrowDownRight} cls="text-amber-600" label="a pagar" v={s.aPagar} />
                <Stat icon={ArrowUpRight} cls="text-emerald-600" label="recebidas" v={s.recebidas} />
                <Stat icon={ArrowUpRight} cls="text-sky-600" label="a receber" v={s.aReceber} />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{s.count} movimentações no período</div>
            </div>
          )
        })}
      </div>

      {editing && (
        <AccountForm
          account={editing === "new" ? null : editing}
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

function Stat({
  icon: Icon,
  cls,
  label,
  v,
}: {
  icon: typeof ArrowDownRight
  cls: string
  label: string
  v: number
}) {
  return (
    <div className={`flex items-center gap-1 ${cls}`}>
      <Icon className="size-3" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{fmtBRL(v)}</span>
    </div>
  )
}

function AccountForm({
  account,
  onClose,
  onSaved,
}: {
  account: FinAccount | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(account?.name ?? "")
  const [kind, setKind] = useState<string>(account?.kind ?? "conta_corrente")
  const [color, setColor] = useState(account?.color ?? CORES[0])
  const [bank, setBank] = useState<string>(account?.bank ?? "")
  const [logoUrl, setLogoUrl] = useState(account?.logoUrl ?? "")
  const [outro, setOutro] = useState(!!account?.logoUrl)
  const [saldo, setSaldo] = useState(account ? String(account.initialBalance).replace(".", ",") : "")
  const [exclude, setExclude] = useState(account?.excludeFromTotal ?? false)
  const [pending, start] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | null | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    const fd = new FormData()
    fd.set("file", file)
    const r = await uploadLogo(fd)
    setUploading(false)
    if (r.ok && r.url) {
      setLogoUrl(r.url)
      setOutro(true)
      setBank("")
    } else setError(r.message ?? "Erro no upload.")
  }

  function submit() {
    if (!name.trim()) return setError("Dê um nome à conta.")
    const fd = new FormData()
    if (account) fd.set("id", account.id)
    fd.set("name", name)
    fd.set("kind", kind)
    fd.set("color", color)
    fd.set("bank", outro ? "" : bank)
    fd.set("logo_url", outro ? logoUrl : "")
    fd.set("initial_balance", saldo)
    fd.set("exclude_from_total", String(exclude))
    start(async () => {
      const r = await saveAccount(fd)
      if (r.ok) onSaved()
      else setError(r.message ?? "Erro")
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{account ? "Editar Conta" : "Nova Conta"}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        <Label>Nome da conta</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Conta Corrente Itaú"
          className={`${inp} mt-1`}
          autoFocus
        />

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
          <div>
            <Label>Tipo</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inp} mt-1`}>
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`size-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Label>Logo do banco (opcional)</Label>
          <div className="mt-1 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            <LogoTile selected={!bank && !outro} caption="Sem logo" onClick={() => { setBank(""); setOutro(false) }}>
              <span className="text-xs text-muted-foreground">—</span>
            </LogoTile>
            {BANK_SLUGS.map((s) => (
              <LogoTile
                key={s}
                selected={bank === s && !outro}
                caption={BANKS[s].name}
                onClick={() => { setBank(s); setOutro(false) }}
              >
                <BankBadge bank={s} size={52} />
              </LogoTile>
            ))}
            <LogoTile selected={outro} caption="Outro" onClick={() => setOutro(true)}>
              <span className="text-2xl font-light text-muted-foreground">+</span>
            </LogoTile>
          </div>
          {outro && (
            <div className="mt-2 space-y-2">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFile(e.dataTransfer.files?.[0])
                }}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading
                  ? "Enviando…"
                  : logoUrl
                    ? "Trocar imagem"
                    : "Arraste ou clique pra enviar a logo (png/jpg/svg, máx. 2 MB)"}
              </label>
              {logoUrl && (
                <div className="flex items-center gap-2">
                  <BankBadge logoUrl={logoUrl} size={40} />
                  <button type="button" onClick={() => setLogoUrl("")} className="text-xs text-rose-600">
                    remover
                  </button>
                </div>
              )}
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="ou cole a URL de uma imagem (https://…)"
                className={inp}
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <Label>Saldo Inicial (R$)</Label>
          <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${inp} mt-1`} />
        </div>

        <button
          type="button"
          onClick={() => setExclude((v) => !v)}
          className="mt-4 flex w-full items-center gap-2 rounded-lg bg-muted/50 p-3 text-left text-sm"
        >
          <span className={`flex size-5 items-center justify-center rounded-full border ${exclude ? "border-primary bg-primary text-primary-foreground" : ""}`}>
            {exclude && <Check className="size-3.5" />}
          </span>
          <span className="font-medium">Não somar no Saldo Geral</span>
        </button>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {account ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  )
}

function LogoTile({
  selected,
  onClick,
  caption,
  children,
}: {
  selected: boolean
  onClick: () => void
  caption: string
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1">
      <span
        className={`relative flex aspect-square w-full items-center justify-center rounded-xl border p-2 ${
          selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
        }`}
      >
        {selected && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        )}
        {children}
      </span>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">{caption}</span>
    </button>
  )
}

const inp = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium text-muted-foreground">{children}</span>
}
