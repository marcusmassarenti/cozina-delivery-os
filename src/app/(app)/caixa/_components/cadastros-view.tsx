"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Pencil, Plus, Search, Trash2, User, X } from "lucide-react"

import type { ContactCounts, FinContact } from "@/lib/data/caixa"

import { deleteContact, lookupCEP, lookupCNPJ, saveContact } from "../_actions"

const PRAZOS = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias"]
const TIPOS = [
  { v: "cliente", l: "Cliente" },
  { v: "fornecedor", l: "Fornecedor" },
  { v: "ambos", l: "Cliente e Fornecedor" },
  { v: "colaborador", l: "Colaborador" },
]
type Tab = "todos" | "clientes" | "fornecedores" | "pf"

export function CadastrosView({ contacts, counts }: { contacts: FinContact[]; counts: ContactCounts }) {
  const [tab, setTab] = useState<Tab>("todos")
  const [search, setSearch] = useState("")
  const [uf, setUf] = useState("")
  const [editing, setEditing] = useState<FinContact | "new" | null>(null)
  const router = useRouter()
  const [pending, start] = useTransition()

  const ufs = useMemo(
    () => [...new Set(contacts.map((c) => c.uf).filter(Boolean))].sort() as string[],
    [contacts],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter((c) => {
      if (tab === "clientes" && !(c.contactType === "cliente" || c.contactType === "ambos")) return false
      if (tab === "fornecedores" && !(c.contactType === "fornecedor" || c.contactType === "ambos")) return false
      if (tab === "pf" && c.personType !== "pf") return false
      if (uf && c.uf !== uf) return false
      if (q) {
        const hay = [c.name, c.legalName, c.doc, c.cidade].filter(Boolean).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [contacts, tab, search, uf])

  function remove(id: string) {
    if (!confirm("Excluir cadastro?")) return
    start(async () => {
      await deleteContact(id)
      router.refresh()
    })
  }

  const TABS: { k: Tab; l: string; n: number }[] = [
    { k: "todos", l: "Todos", n: counts.todos },
    { k: "clientes", l: "Clientes", n: counts.clientes },
    { k: "fornecedores", l: "Fornecedores", n: counts.fornecedores },
    { k: "pf", l: "Pessoa Física", n: counts.pf },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Empresas &amp; Pessoas</h2>
          <p className="text-sm text-muted-foreground">Clientes, fornecedores e pessoas físicas</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Novo Cadastro
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.k ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t.l}
              <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px]">{t.n}</span>
            </button>
          ))}
        </div>
        {ufs.length > 0 && (
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={chip}>
            <option value="">Todas UFs</option>
            {ufs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <div className="relative ml-auto min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, CNPJ/CPF, cidade…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">CNPJ/CPF</th>
              <th className="px-4 py-2 font-medium">Prazo</th>
              <th className="px-4 py-2 font-medium">Telefone</th>
              <th className="px-4 py-2 font-medium">Cidade/UF</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {contacts.length ? "Nenhum cadastro com esses filtros." : "Nenhum cadastro ainda."}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {c.personType === "pf" ? (
                      <User className="size-4 text-muted-foreground" />
                    ) : (
                      <Building2 className="size-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{c.doc ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {c.paymentTerm ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{c.paymentTerm}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {c.cidade ? `${c.cidade}/${c.uf ?? ""}` : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {c.personType === "pf" ? "PF" : TIPOS.find((t) => t.v === c.contactType)?.l ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(c)} className="rounded p-1.5 hover:bg-accent" title="Editar">
                      <Pencil className="size-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => remove(c.id)} disabled={pending} className="rounded p-1.5 hover:bg-accent" title="Excluir">
                      <Trash2 className="size-4 text-rose-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContactForm
          contact={editing === "new" ? null : editing}
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

const EMPTY = {
  person_type: "pj",
  name: "",
  legal_name: "",
  doc: "",
  contact_type: "cliente",
  payment_term: "28 dias",
  state_registration: "",
  phone: "",
  email: "",
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "",
  complemento: "",
}

function ContactForm({
  contact,
  onClose,
  onSaved,
}: {
  contact: FinContact | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    ...EMPTY,
    ...(contact
      ? {
          person_type: contact.personType,
          name: contact.name,
          legal_name: contact.legalName ?? "",
          doc: contact.doc ?? "",
          contact_type: contact.contactType,
          payment_term: contact.paymentTerm ?? "28 dias",
          state_registration: contact.stateRegistration ?? "",
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          cep: contact.cep ?? "",
          logradouro: contact.logradouro ?? "",
          numero: contact.numero ?? "",
          bairro: contact.bairro ?? "",
          cidade: contact.cidade ?? "",
          uf: contact.uf ?? "",
          complemento: contact.complemento ?? "",
        }
      : {}),
  })
  const [pending, start] = useTransition()
  const [looking, setLooking] = useState<"cep" | "cnpj" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const isPJ = f.person_type === "pj"

  function consultarCNPJ() {
    setLooking("cnpj")
    start(async () => {
      const r = await lookupCNPJ(f.doc)
      setLooking(null)
      if (r.ok && r.data) {
        setF((p) => ({
          ...p,
          name: p.name || r.data!.name,
          legal_name: r.data!.legalName,
          phone: p.phone || r.data!.phone,
          email: p.email || r.data!.email,
          cep: r.data!.cep,
          logradouro: r.data!.logradouro,
          numero: r.data!.numero,
          bairro: r.data!.bairro,
          cidade: r.data!.cidade,
          uf: r.data!.uf,
        }))
      } else setError(r.message ?? "CNPJ não encontrado.")
    })
  }
  function buscarCEP() {
    setLooking("cep")
    start(async () => {
      const r = await lookupCEP(f.cep)
      setLooking(null)
      if (r.ok && r.data) {
        setF((p) => ({ ...p, logradouro: r.data!.logradouro, bairro: r.data!.bairro, cidade: r.data!.cidade, uf: r.data!.uf }))
      } else setError(r.message ?? "CEP não encontrado.")
    })
  }
  function submit() {
    setError(null)
    const fd = new FormData()
    if (contact) fd.set("id", contact.id)
    Object.entries(f).forEach(([k, v]) => fd.set(k, v))
    start(async () => {
      const r = await saveContact(fd)
      if (r.ok) onSaved()
      else setError(r.message ?? "Erro")
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 w-full max-w-2xl rounded-xl border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{contact ? "Editar Cadastro" : "Novo Cadastro"}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {/* Tipo de pessoa */}
        <div className="mb-4">
          <Label>Tipo de Pessoa</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["pj", "pf"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("person_type", t)}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium ${
                  f.person_type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {t === "pj" ? <Building2 className="size-4" /> : <User className="size-4" />}
                {t === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
              </button>
            ))}
          </div>
        </div>

        {/* Documento + consulta */}
        <div className="mb-3">
          <Label>{isPJ ? "CNPJ" : "CPF"}</Label>
          <div className="mt-1 flex gap-2">
            <input value={f.doc} onChange={(e) => set("doc", e.target.value)} placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"} className={inp} />
            {isPJ && (
              <button type="button" onClick={consultarCNPJ} disabled={pending} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
                {looking === "cnpj" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Consultar
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome {isPJ ? "/ Fantasia" : ""} *</Label>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={`${inp} mt-1`} />
          </div>
          {isPJ && (
            <div>
              <Label>Razão Social</Label>
              <input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} className={`${inp} mt-1`} />
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Tipo</Label>
            <select value={f.contact_type} onChange={(e) => set("contact_type", e.target.value)} className={`${inp} mt-1`}>
              {TIPOS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Prazo Pagamento</Label>
            <select value={f.payment_term} onChange={(e) => set("payment_term", e.target.value)} className={`${inp} mt-1`}>
              {PRAZOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {isPJ && (
            <div>
              <Label>Inscrição Estadual</Label>
              <input value={f.state_registration} onChange={(e) => set("state_registration", e.target.value)} placeholder="IE" className={`${inp} mt-1`} />
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Telefone</Label>
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={`${inp} mt-1`} />
          </div>
          <div>
            <Label>Email</Label>
            <input value={f.email} onChange={(e) => set("email", e.target.value)} className={`${inp} mt-1`} />
          </div>
        </div>

        {/* Endereço */}
        <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          📍 Endereço
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>CEP</Label>
            <div className="mt-1 flex gap-2">
              <input value={f.cep} onChange={(e) => set("cep", e.target.value)} className={inp} />
              <button type="button" onClick={buscarCEP} disabled={pending} className="inline-flex shrink-0 items-center rounded-md border px-3 hover:bg-accent disabled:opacity-50">
                {looking === "cep" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Logradouro</Label>
            <input value={f.logradouro} onChange={(e) => set("logradouro", e.target.value)} className={`${inp} mt-1`} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Número</Label>
            <input value={f.numero} onChange={(e) => set("numero", e.target.value)} className={`${inp} mt-1`} />
          </div>
          <div>
            <Label>Bairro</Label>
            <input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} className={`${inp} mt-1`} />
          </div>
          <div>
            <Label>Cidade</Label>
            <input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} className={`${inp} mt-1`} />
          </div>
          <div>
            <Label>UF</Label>
            <input value={f.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} className={`${inp} mt-1`} />
          </div>
        </div>
        <div className="mt-3">
          <Label>Complemento</Label>
          <input value={f.complemento} onChange={(e) => set("complemento", e.target.value)} className={`${inp} mt-1`} />
        </div>

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
            {pending && !looking && <Loader2 className="size-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

const inp = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
const chip = "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium text-muted-foreground">{children}</span>
}
