"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet, Loader2, Plus, Trash2, X } from "lucide-react"

import {
  deleteInsumo,
  forceDeleteInsumo,
  importInsumos,
  replaceInsumoAndDelete,
  upsertInsumosRows,
} from "../_actions"
import type { Insumo } from "@/lib/data/producao"

/**
 * Catálogo de insumos do ERP. Três jeitos de cadastrar:
 *  1) campos (Código / Nome / Unidade) — o mais simples;
 *  2) baixar modelo .xlsx, preencher e importar;
 *  3) colar texto em massa (avançado).
 */
export function InsumoImport({ insumos }: { insumos: Insumo[] }) {
  const router = useRouter()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [form, setForm] = React.useState({ codigo: "", nome: "", unidade: "UN" })
  const [pasteOpen, setPasteOpen] = React.useState(false)
  const [paste, setPaste] = React.useState("")
  const [listOpen, setListOpen] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const addOne = () => {
    if (!form.codigo.trim() || !form.nome.trim()) return
    start(async () => {
      const res = await upsertInsumosRows([form])
      setMsg(res.message ?? (res.ok ? "Salvo." : "Erro."))
      if (res.ok) {
        setForm({ codigo: "", nome: "", unidade: "UN" })
        router.refresh()
      }
    })
  }

  const baixarModelo = async () => {
    const XLSX = await import("xlsx")
    const rows = insumos.length
      ? insumos.map((i) => ({
          Código: i.codigo,
          Nome: i.nome,
          Unidade: i.unidade,
        }))
      : [
          { Código: "CNP053", Nome: "BRISKET 100G", Unidade: "UN" },
          { Código: "CNP061", Nome: "PULLED PORK 100G", Unidade: "UN" },
        ]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Insumos")
    XLSX.writeFile(wb, "modelo-insumos.xlsx")
  }

  const importarPlanilha = async (file: File) => {
    const XLSX = await import("xlsx")
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    const pick = (r: Record<string, unknown>, keys: string[]) => {
      for (const k of keys) {
        const v = r[k]
        if (v != null && String(v).trim()) return String(v).trim()
      }
      return ""
    }
    const rows = json
      .map((r) => ({
        codigo: pick(r, ["Código", "Codigo", "codigo", "CÓDIGO", "CODIGO"]),
        nome: pick(r, ["Nome", "nome", "NOME"]),
        unidade: pick(r, ["Unidade", "unidade", "UN", "Un"]) || "UN",
      }))
      .filter((r) => r.codigo)
    if (rows.length === 0) {
      setMsg("Planilha sem linhas válidas (precisa de Código + Nome).")
      return
    }
    start(async () => {
      const res = await upsertInsumosRows(rows)
      setMsg(res.message ?? "")
      if (res.ok) router.refresh()
    })
  }

  const importarPaste = () => {
    start(async () => {
      const res = await importInsumos(paste)
      setMsg(res.message ?? "")
      if (res.ok) {
        setPaste("")
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Catálogo de insumos (ERP)</h3>
        <span className="text-[11px] text-muted-foreground">
          {insumos.length} cadastrados
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={baixarModelo}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" /> modelo .xlsx
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <FileSpreadsheet className="size-3.5" /> importar .xlsx
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importarPlanilha(f)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      {/* Campos pra adicionar 1 insumo */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            Código
          </span>
          <input
            value={form.codigo}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addOne()}
            placeholder="CNP053"
            className="h-9 w-28 rounded-md border bg-background px-2 font-mono text-xs uppercase outline-none focus:border-ring"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            Nome
          </span>
          <input
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addOne()}
            placeholder="BRISKET 100G"
            className="h-9 w-full min-w-32 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            Unidade
          </span>
          <input
            value={form.unidade}
            onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addOne()}
            placeholder="UN"
            className="h-9 w-20 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          />
        </label>
        <button
          type="button"
          onClick={addOne}
          disabled={pending || !form.codigo.trim() || !form.nome.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Adicionar
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {insumos.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            className="text-[11px] text-muted-foreground underline"
          >
            {listOpen ? "ocultar catálogo" : "ver catálogo"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          className="text-[11px] text-muted-foreground underline"
        >
          {pasteOpen ? "fechar" : "colar em massa (texto)"}
        </button>
        {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      </div>

      {pasteOpen && (
        <div className="mt-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"CNP053\tBRISKET 100G\tUN\nCNP061\tPULLED PORK 100G\tUN"}
            rows={3}
            className="w-full rounded-md border bg-background p-2 font-mono text-xs outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={importarPaste}
            disabled={pending || !paste.trim()}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Importar texto
          </button>
        </div>
      )}

      {listOpen && (
        <div className="mt-3 max-h-60 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 font-semibold">Código</th>
                <th className="px-2 py-1.5 font-semibold">Nome</th>
                <th className="px-2 py-1.5 font-semibold">Unidade</th>
                <th className="w-8 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {insumos.map((i) => (
                <CatalogRow
                  key={i.codigo}
                  insumo={i}
                  outros={insumos.filter((x) => x.codigo !== i.codigo)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CatalogRow({
  insumo,
  outros,
}: {
  insumo: Insumo
  outros: Insumo[]
}) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [sub, setSub] = React.useState(false) // modo "substituir e excluir"
  const [subTo, setSubTo] = React.useState("")
  const [erro, setErro] = React.useState<string | null>(null)

  const excluir = () => {
    setErro(null)
    start(async () => {
      const res = await deleteInsumo(insumo.codigo)
      if (res.ok) {
        router.refresh()
      } else if (res.emUso) {
        setSub(true)
        setErro(res.message ?? "Em uso.")
      } else {
        setErro(res.message ?? "Erro.")
      }
    })
  }
  const substituir = () => {
    if (!subTo) return
    start(async () => {
      const res = await replaceInsumoAndDelete({
        fromCodigo: insumo.codigo,
        toCodigo: subTo,
      })
      if (res.ok) router.refresh()
      else setErro(res.message ?? "Erro.")
    })
  }
  const forcar = () => {
    if (
      !confirm(
        `Excluir "${insumo.codigo}" e remover de ${insumo.emUso} ficha(s)?`,
      )
    )
      return
    start(async () => {
      const res = await forceDeleteInsumo(insumo.codigo)
      if (res.ok) router.refresh()
      else setErro(res.message ?? "Erro.")
    })
  }

  return (
    <>
      <tr className={insumo.ativo ? "" : "opacity-50"}>
        <td className="px-2 py-1 font-mono font-medium">{insumo.codigo}</td>
        <td className="px-2 py-1">
          {insumo.nome}
          {insumo.emUso > 0 && (
            <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              em {insumo.emUso} ficha{insumo.emUso > 1 ? "s" : ""}
            </span>
          )}
        </td>
        <td className="px-2 py-1 text-muted-foreground">{insumo.unidade}</td>
        <td className="px-2 py-1 text-right">
          <button
            type="button"
            onClick={excluir}
            disabled={pending}
            aria-label="Excluir insumo"
            title={
              insumo.emUso > 0
                ? "Em uso — vai pedir substituição"
                : "Excluir insumo"
            }
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/30"
          >
            {pending && !sub ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        </td>
      </tr>
      {(sub || erro) && (
        <tr>
          <td colSpan={4} className="bg-amber-50 px-2 py-2 dark:bg-amber-950/20">
            {erro && (
              <p className="mb-1 text-[11px] text-amber-800 dark:text-amber-300">
                {erro}
              </p>
            )}
            {sub && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Substituir <b>{insumo.codigo}</b> por:
                </span>
                <select
                  value={subTo}
                  onChange={(e) => setSubTo(e.target.value)}
                  className="h-7 w-48 rounded-md border bg-background px-1.5 text-[11px] outline-none focus:border-ring"
                >
                  <option value="">— escolha —</option>
                  {outros.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.codigo} — {o.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={substituir}
                  disabled={pending || !subTo}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  Substituir e excluir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSub(false)
                    setErro(null)
                  }}
                  aria-label="Cancelar"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={forcar}
                  disabled={pending}
                  className="ml-auto text-[11px] font-medium text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                >
                  ou excluir assim mesmo (sai de {insumo.emUso} ficha
                  {insumo.emUso > 1 ? "s" : ""})
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
