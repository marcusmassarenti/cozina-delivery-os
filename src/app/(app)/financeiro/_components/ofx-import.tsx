"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Upload, X } from "lucide-react"

import type { FinAccount } from "@/lib/data/caixa"

import { importOfx } from "../_actions"

export function OfxImport({ accounts }: { accounts: FinAccount[] }) {
  const contas = accounts.filter((a) => a.kind !== "cartao")
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(contas[0]?.id ?? "")
  const [fileName, setFileName] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; imported: number; skipped: number; message?: string } | null>(null)
  const router = useRouter()

  function reset() {
    setFileName(null)
    setConteudo(null)
    setResult(null)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => setConteudo(String(reader.result ?? ""))
    reader.readAsText(f, "latin1") // extratos BR costumam vir em latin1
  }

  function importar() {
    if (!accountId || !conteudo) return
    start(async () => {
      const r = await importOfx(accountId, conteudo)
      setResult(r)
      if (r.ok && r.imported > 0) router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <Upload className="size-4" />
        Importar extrato (OFX)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Importar extrato bancário (OFX)</h2>
              <button onClick={() => { setOpen(false); reset() }} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            {result?.ok ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-600" />
                <p className="text-sm font-medium">
                  {result.imported} lançamento{result.imported !== 1 ? "s" : ""} importado{result.imported !== 1 ? "s" : ""}.
                </p>
                {result.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">{result.skipped} já existia{result.skipped !== 1 ? "m" : ""} (não duplicou).</p>
                )}
                <p className="text-xs text-muted-foreground">Categorize os novos lançamentos na lista abaixo.</p>
                <button onClick={() => { setOpen(false); reset() }} className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Conta</span>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
                  >
                    {contas.length === 0 && <option value="">Cadastre uma conta primeiro</option>}
                    {contas.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center hover:bg-muted/50">
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{fileName ?? "Escolher arquivo .ofx"}</span>
                  <span className="text-[11px] text-muted-foreground">Baixe o extrato em OFX no app do seu banco</span>
                  <input type="file" accept=".ofx,text/plain" onChange={onFile} className="hidden" />
                </label>

                <p className="text-[11px] text-muted-foreground">
                  As transações entram já efetivadas e conciliadas. O mesmo lançamento não é
                  importado duas vezes.
                </p>

                {result && !result.ok && (
                  <p className="text-xs text-rose-600">{result.message}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => { setOpen(false); reset() }} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    Cancelar
                  </button>
                  <button
                    onClick={importar}
                    disabled={pending || !accountId || !conteudo}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    Importar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
