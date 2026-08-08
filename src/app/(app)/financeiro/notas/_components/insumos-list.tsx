"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pencil, X } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { Insumo } from "@/lib/data/nf"
import { salvarFator } from "../_actions"

/** Unidades de uso comuns numa ficha técnica. Texto livre também serve — o
 *  campo aceita qualquer coisa, a lista só poupa digitação. */
const UNIDADES = ["g", "kg", "ml", "l", "un", "fatia", "porção"]

/**
 * Catálogo de insumos com o fator de conversão editável na própria linha.
 *
 * O fator é o que separa "custei R$ 614,40 numa caixa" de "cada pote custa
 * R$ 1,28" — e sem ele a ficha técnica não fecha. Editar na linha, sem abrir
 * modal, porque isso é trabalho de lote: quem senta pra preencher, preenche
 * vinte de uma vez.
 */
export function InsumosList({ insumos }: { insumos: Insumo[] }) {
  const [filtro, setFiltro] = useState("")
  const [soPendentes, setSoPendentes] = useState(false)

  const busca = filtro.trim().toLowerCase()
  const lista = insumos.filter((i) => {
    if (soPendentes && i.fatorConversao) return false
    if (!busca) return true
    return (
      i.nome.toLowerCase().includes(busca) ||
      i.codigo.toLowerCase().includes(busca)
    )
  })
  const pendentes = insumos.filter((i) => !i.fatorConversao).length

  if (insumos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Nenhum insumo ainda. Importe a primeira nota — o catálogo se monta
        sozinho a partir dos itens dela.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Insumos</h2>
          <p className="text-xs text-muted-foreground">
            {insumos.length} no catálogo
            {pendentes > 0 && ` · ${pendentes} sem fator de conversão`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendentes > 0 && (
            <button
              type="button"
              onClick={() => setSoPendentes((v) => !v)}
              className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
                soPendentes
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              Só os pendentes
            </button>
          )}
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar insumo ou código"
            className="h-9 w-56 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Insumo</th>
              <th className="px-3 py-2 text-right font-medium">Custo de compra</th>
              <th className="px-3 py-2 text-center font-medium">Conversão</th>
              <th className="px-4 py-2 text-right font-medium">Custo por unidade</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <Linha key={i.id} insumo={i} />
            ))}
          </tbody>
        </table>
        {lista.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum insumo com esse filtro.
          </p>
        )}
      </div>
    </div>
  )
}

function Linha({ insumo }: { insumo: Insumo }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [unidade, setUnidade] = useState(insumo.unidadeUso ?? "")
  const [fator, setFator] = useState(
    insumo.fatorConversao ? String(insumo.fatorConversao) : "",
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const n = fator.trim() ? Number(fator.replace(",", ".")) : null
    setSalvando(true)
    setErro(null)
    const r = await salvarFator(insumo.id, unidade.trim() || null, n)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? "Falha ao salvar.")
      return
    }
    setEditando(false)
    router.refresh()
  }

  return (
    <tr className="border-b transition last:border-0 hover:bg-accent/40">
      <td className="px-4 py-2.5">
        <div className="font-medium">{insumo.nome}</div>
        <div className="text-[11px] text-muted-foreground">
          {insumo.codigo}
          {insumo.notas > 0 &&
            ` · ${insumo.notas} ${insumo.notas === 1 ? "nota" : "notas"}`}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {insumo.custoCompra === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {fmtBRL(insumo.custoCompra)}
            <span className="text-[11px] text-muted-foreground">
              {" "}
              / {insumo.unidadeCompra}
            </span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        {editando ? (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center gap-1 text-xs">
              <span className="text-muted-foreground">1 {insumo.unidadeCompra} =</span>
              <input
                autoFocus
                value={fator}
                onChange={(e) => setFator(e.target.value)}
                inputMode="decimal"
                className="h-8 w-20 rounded-md border bg-background px-2 text-right outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                list="unidades-uso"
                placeholder="un"
                className="h-8 w-16 rounded-md border bg-background px-2 outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="unidades-uso">
                {UNIDADES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/40"
                aria-label="Salvar"
              >
                {salvando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Cancelar"
              >
                <X className="size-4" />
              </button>
            </div>
            {erro && <span className="text-[11px] text-rose-600">{erro}</span>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
          >
            {insumo.fatorConversao ? (
              <span className="tabular-nums">
                1 {insumo.unidadeCompra} = {insumo.fatorConversao}{" "}
                {insumo.unidadeUso ?? "un"}
              </span>
            ) : (
              <span className="text-amber-600">definir</span>
            )}
            <Pencil className="size-3 text-muted-foreground" />
          </button>
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
        {insumo.custoAtual === null ? (
          <span
            className="text-xs font-normal text-muted-foreground"
            title="Falta o fator de conversão para traduzir o preço de compra na unidade da ficha técnica."
          >
            falta a conversão
          </span>
        ) : (
          <>
            {fmtBRL(insumo.custoAtual)}
            <span className="text-[11px] font-normal text-muted-foreground">
              {" "}
              / {insumo.unidadeUso}
            </span>
          </>
        )}
      </td>
    </tr>
  )
}
