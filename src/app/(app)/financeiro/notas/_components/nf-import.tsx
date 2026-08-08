"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { confirmarImportacao, lerXml, type PreviaNF } from "../_actions"

/**
 * Importação da NF em dois passos: ler → conferir → gravar.
 *
 * O passo do meio existe por causa do cadastro real: hoje 14 das 16 lojas
 * estão sem CNPJ, então na maioria das notas o sistema não tem como saber de
 * quem ela é. Perguntar antes de gravar é melhor que gravar e corrigir depois
 * -- custo errado circulando, mesmo por minutos, é custo errado.
 *
 * Ao escolher a loja, o CNPJ do destinatário é gravado nela: da segunda nota
 * daquela loja em diante, não pergunta mais.
 */
export function NfImport({
  units,
}: {
  units: { id: string; name: string }[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<PreviaNF | null>(null)
  const [loja, setLoja] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  function limpar() {
    setArquivo(null)
    setPrevia(null)
    setLoja("")
    setErro(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function escolher(f: File | null) {
    if (!f) return
    setErro(null)
    setOk(null)
    setArquivo(f)
    setOcupado(true)
    const fd = new FormData()
    fd.set("arquivo", f)
    const r = await lerXml(fd)
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro)
      setPrevia(null)
      return
    }
    setPrevia(r)
    setLoja(r.unitId ?? "")
  }

  async function confirmar() {
    if (!arquivo || !loja) return
    setOcupado(true)
    setErro(null)
    const fd = new FormData()
    fd.set("arquivo", arquivo)
    fd.set("unitId", loja)
    const r = await confirmarImportacao(fd)
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    const partes = [`${r.itens} itens`]
    if (r.insumosNovos) partes.push(`${r.insumosNovos} insumos novos`)
    if (r.insumosAtualizados)
      partes.push(`${r.insumosAtualizados} com custo atualizado`)
    if (r.cnpjAprendido)
      partes.push(`CNPJ gravado em ${r.loja} — a próxima nota entra sozinha`)
    setOk(partes.join(" · "))
    limpar()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Importar nota fiscal</h2>
          <p className="text-xs text-muted-foreground">
            O XML da NF-e de compra. O custo de cada insumo se atualiza sozinho.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
          {ocupado ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileUp className="size-4" />
          )}
          Escolher XML
          <input
            ref={inputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            disabled={ocupado}
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {ok && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          <span>Nota importada — {ok}.</span>
        </div>
      )}

      {previa && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <Linha rotulo="Nota" valor={`nº ${previa.numero ?? "—"}`} />
            <Linha
              rotulo="Emissão"
              valor={previa.emissao ? fmtData(previa.emissao) : "—"}
            />
            <Linha rotulo="Fornecedor" valor={previa.emitNome ?? "—"} />
            <Linha rotulo="Destinatário" valor={previa.destNome ?? "—"} />
            <Linha rotulo="Itens" valor={String(previa.itens)} />
            <Linha rotulo="Total" valor={fmtBRL(previa.valorTotal)} />
          </div>

          {previa.avisos.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              {previa.avisos.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">
                {previa.unitId ? "Loja (reconhecida pelo CNPJ)" : "De qual loja é esta nota?"}
              </span>
              <select
                value={loja}
                onChange={(e) => setLoja(e.target.value)}
                className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Escolha a loja…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado || !loja}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {ocupado && <Loader2 className="size-4 animate-spin" />}
              Importar
            </button>
            <button
              type="button"
              onClick={limpar}
              disabled={ocupado}
              className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>

          {!previa.unitId && previa.destCnpj && (
            <p className="text-[11px] text-muted-foreground">
              O CNPJ {fmtCnpj(previa.destCnpj)} ainda não está em nenhuma loja.
              Ao importar, ele é gravado na loja escolhida — e a próxima nota
              dela entra sozinha.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed pb-1">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  )
}

function fmtData(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}
