"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, ChevronDown, Loader2, Plus, Search, User } from "lucide-react"

import type { FinContact } from "@/lib/data/caixa"

import { saveContact } from "../_actions"

const TIPO_LABEL: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Cliente e Fornecedor",
  colaborador: "Colaborador",
}

export function ContatoPicker({
  contacts,
  value,
  onChange,
}: {
  contacts: FinContact[]
  value: string
  onChange: (name: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState(false)
  const router = useRouter()
  const [pending, start] = useTransition()

  // quick-add
  const [qName, setQName] = useState("")
  const [qPerson, setQPerson] = useState("pj")
  const [qType, setQType] = useState("cliente")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (c.doc ?? "").includes(search.replace(/\D/g, "")),
      )
    : contacts

  function selecionar(name: string) {
    onChange(name)
    setOpen(false)
    setSearch("")
  }

  function quickAdd() {
    if (!qName.trim()) return setError("Informe o nome.")
    const fd = new FormData()
    fd.set("name", qName.trim())
    fd.set("person_type", qPerson)
    fd.set("contact_type", qType)
    start(async () => {
      const r = await saveContact(fd)
      if (r.ok) {
        onChange(qName.trim())
        setAdding(false)
        setOpen(false)
        setQName("")
        setError(null)
        router.refresh()
      } else setError(r.message ?? "Erro ao cadastrar.")
    })
  }

  return (
    <div ref={ref} className="relative">
      {/* trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {value || "Selecione ou cadastre"}
        </span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <input type="hidden" name="titular" value={value} />

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-card shadow-xl">
          {!adding ? (
            <>
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome ou CPF/CNPJ…"
                    className="h-9 w-full rounded-md border bg-background pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                    Nenhum cadastro encontrado.
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selecionar(c.name)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent"
                    >
                      {c.personType === "pf" ? (
                        <User className="size-4 shrink-0 text-sky-600" />
                      ) : (
                        <Building2 className="size-4 shrink-0 text-sky-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{c.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {TIPO_LABEL[c.contactType] ?? ""}
                          {c.doc ? ` · ${c.doc}` : ""}
                        </div>
                      </div>
                      {value === c.name && <Check className="size-4 text-primary" />}
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setQName(search)
                  setAdding(true)
                  setError(null)
                }}
                className="flex w-full items-center justify-center gap-2 bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-4" />
                Adicionar novo cadastro
              </button>
            </>
          ) : (
            <div className="space-y-2 p-3">
              <div className="text-sm font-semibold">Cadastro rápido</div>
              <input
                autoFocus
                value={qName}
                onChange={(e) => setQName(e.target.value)}
                placeholder="Nome / Razão social"
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={qPerson}
                  onChange={(e) => setQPerson(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2.5 text-sm"
                >
                  <option value="pj">Pessoa Jurídica</option>
                  <option value="pf">Pessoa Física</option>
                </select>
                <select
                  value={qType}
                  onChange={(e) => setQType(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2.5 text-sm"
                >
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="ambos">Cliente e Fornecedor</option>
                </select>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="flex-1 rounded-md border py-1.5 text-sm hover:bg-accent"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={quickAdd}
                  disabled={pending}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  Salvar e usar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
