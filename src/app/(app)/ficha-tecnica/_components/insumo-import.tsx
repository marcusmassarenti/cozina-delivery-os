"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"

import { importInsumos } from "../_actions"
import type { Insumo } from "@/lib/data/producao"

/**
 * Catálogo de insumos do ERP. Importa colando texto (uma linha por insumo,
 * colunas separadas por TAB: Código / Nome / Unidade — ideal pra colar direto
 * de uma planilha do ERP).
 */
export function InsumoImport({ insumos }: { insumos: Insumo[] }) {
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const submit = () => {
    start(async () => {
      const res = await importInsumos(text)
      setMsg(res.message ?? (res.ok ? "Salvo." : "Erro."))
      if (res.ok) {
        setText("")
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold">Catálogo de insumos (ERP)</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {insumos.length} insumo(s) cadastrados. Cole do ERP: uma linha por
        insumo, colunas <b>Código → Nome → Unidade</b> separadas por TAB.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"CNP053\tBRISKET 100G\tUN\nCNP061\tPULLED PORK 100G\tUN"}
        rows={4}
        className="mt-3 w-full rounded-md border bg-background p-2 font-mono text-xs outline-none focus:border-ring"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Importar / atualizar
        </button>
        {insumos.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-muted-foreground underline"
          >
            {open ? "ocultar" : "ver catálogo"}
          </button>
        )}
        {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      </div>
      {open && (
        <div className="mt-3 max-h-48 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <tbody className="divide-y">
              {insumos.map((i) => (
                <tr key={i.codigo} className={i.ativo ? "" : "opacity-50"}>
                  <td className="px-2 py-1 font-mono font-medium">{i.codigo}</td>
                  <td className="px-2 py-1">{i.nome}</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {i.unidade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
