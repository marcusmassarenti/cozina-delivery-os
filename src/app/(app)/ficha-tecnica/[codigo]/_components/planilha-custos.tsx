"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, HelpCircle, Loader2, Upload } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { ItemCusto } from "@/lib/data/custo-itens"

import { importarCustosPlanilha } from "../../_actions"

/**
 * Exportar e importar os custos em planilha.
 *
 * ── POR QUE EXPORTAR JÁ PREENCHIDO ───────────────────────────────────────
 * A planilha sai com TODOS os itens vendidos da loja, com preço e volume, e as
 * colunas de custo e categoria em branco (ou com o que já existe). Não é um
 * "modelo vazio": quem recebe já tem a lista certa, na ordem certa, e só
 * preenche a coluna que falta. Modelo vazio obrigaria a pessoa a copiar 127
 * nomes de algum lugar — e é aí que os nomes saem errados e nada casa na volta.
 *
 * ⚠️ NOME e PLATAFORMA são a chave e não podem ser editados na planilha. Se
 * alguém trocar o nome, a linha volta como item que não existe e é recusada
 * na prévia, em vez de criar um custo órfão.
 */
export function PlanilhaCustos({
  unitId,
  lojaNome,
  itens,
}: {
  unitId: string
  lojaNome: string
  itens: ItemCusto[]
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [ajuda, setAjuda] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const NOMES: Record<string, string> = {
    ifood: "iFood",
    "99food": "99 Food",
    keeta: "Keeta",
    cardapioweb: "Cardápio Web",
  }

  async function exportar() {
    setOcupado(true)
    setErro(null)
    try {
      const XLSX = await import("xlsx")
      const linhas = itens.map((i) => ({
        Plataforma: NOMES[i.platform] ?? i.platform,
        Item: i.nomeItem,
        Categoria: i.categoria ?? "",
        // As duas colunas que a pessoa preenche vêm lado a lado, antes das de
        // leitura — quem abre a planilha começa a digitar onde o olho para.
        "Preço de venda (R$)": i.precoVenda ?? "",
        "Custo (R$)": i.custo ?? "",
        "Preço médio": Number(i.precoMedio.toFixed(2)),
        "Qtd vendida": i.qtd,
        "Receita no mês": Number(i.receita.toFixed(2)),
      }))
      const ws = XLSX.utils.json_to_sheet(linhas)
      ws["!cols"] = [
        { wch: 14 },
        { wch: 46 },
        { wch: 18 },
        { wch: 20 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Custos")
      XLSX.writeFile(
        wb,
        `custos-${lojaNome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para gerar a planilha.")
    }
    setOcupado(false)
  }

  async function importar(file: File) {
    setOcupado(true)
    setErro(null)
    setMsg(null)
    try {
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

      const porNome = new Map(Object.entries(NOMES).map(([k, v]) => [v, k]))

      // A coluna existe no ARQUIVO? Planilha exportada antes de 17/08/26 não
      // tem, e nesse caso o preço não pode ser tocado — ver `incluiPrecoVenda`.
      // Testa no cabeçalho, não nos valores: uma planilha nova com a coluna
      // toda em branco é um pedido legítimo de limpar os preços.
      const COL_PRECO = "Preço de venda (R$)"
      const incluiPrecoVenda = linhas.some((l) =>
        Object.prototype.hasOwnProperty.call(l, COL_PRECO),
      )
      const payload: {
        platform: string
        nomeItem: string
        custo: number | null
        categoria: string | null
        precoVenda: number | null
      }[] = []

      // Aceita "22,40" e "22.40": a planilha vem do Excel em pt-BR, mas quem
      // edita no Google Sheets às vezes salva com ponto.
      const numero = (v: unknown): number | null => {
        const bruto = String(v ?? "").trim()
        if (bruto === "") return null
        const n = Number(bruto.replace(/\./g, "").replace(",", "."))
        return Number.isFinite(n) ? n : null
      }

      for (const l of linhas) {
        const plataforma = String(l["Plataforma"] ?? "").trim()
        const nome = String(l["Item"] ?? "").trim()
        if (!nome) continue
        const key = porNome.get(plataforma) ?? plataforma
        payload.push({
          platform: key,
          nomeItem: nome,
          custo: numero(l["Custo (R$)"]),
          categoria: String(l["Categoria"] ?? "").trim() || null,
          precoVenda: numero(l[COL_PRECO]),
        })
      }

      const r = await importarCustosPlanilha({
        unitId,
        linhas: payload,
        incluiPrecoVenda,
      })
      if (!r.ok) setErro(r.erro ?? "Não deu para importar.")
      else {
        setMsg(
          `${r.gravados} ${r.gravados === 1 ? "item atualizado" : "itens atualizados"}` +
            (r.ignorados ? ` · ${r.ignorados} ignorados (item não encontrado)` : ""),
        )
        router.refresh()
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Arquivo inválido.")
    }
    setOcupado(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  const preenchidos = itens.filter((i) => i.custo !== null).length

  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={exportar}
          disabled={ocupado || itens.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Exportar planilha
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <Upload className="size-3.5" />
          Importar preenchida
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importar(f)
          }}
        />
        <button
          onClick={() => setAjuda((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-3.5" />
          Como funciona
        </button>
        <span className="text-[11px] text-muted-foreground">
          {preenchidos} de {itens.length} itens com custo
        </span>
      </div>

      {msg && (
        <p className="mt-2 text-xs font-medium text-emerald-600">{msg}</p>
      )}
      {erro && <p className="mt-2 text-xs font-medium text-rose-600">{erro}</p>}

      {ajuda && (
        <div className="mt-3 space-y-2 border-t pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <p>
            <b className="text-foreground">1. Exporte a planilha.</b> Ela já sai
            com todos os itens que a loja vendeu no mês, com o preço médio e a
            quantidade. Você preenche <b>Preço de venda (R$)</b> — o preço do seu
            cardápio — e <b>Custo (R$)</b>. A <b>Categoria</b> é opcional.
          </p>
          <p>
            <b className="text-foreground">2. Preencha o que importa primeiro.</b>{" "}
            A planilha vem ordenada da maior receita pra menor. Os 20 primeiros
            itens costumam ser quase 90% do faturamento da loja.
          </p>
          <p>
            <b className="text-foreground">3. Importe de volta.</b> Não mexa nas
            colunas <b>Plataforma</b> e <b>Item</b>: são elas que dizem a qual
            linha o custo pertence. Item renomeado não é encontrado e a linha é
            ignorada, em vez de virar um custo solto.
          </p>
          <p>
            <b className="text-foreground">O custo vale para os próximos meses.</b>{" "}
            Ele é do item, não do mês: preencheu uma vez, aparece em agosto,
            setembro e assim por diante. Só volte aqui quando o preço de compra
            mudar.
          </p>
          <p>
            <b className="text-foreground">Custo é por unidade vendida</b> — o
            que sai do estoque quando o cliente pede um. Preço médio da loja
            hoje: {fmtBRL(itens[0]?.precoMedio ?? 0)} no item mais vendido.
          </p>
        </div>
      )}
    </div>
  )
}
