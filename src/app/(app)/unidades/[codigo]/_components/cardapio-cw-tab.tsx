import { UtensilsCrossed } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { fmtBRL, fmtNum } from "@/lib/format"

/**
 * Aba Cardápio do Cardápio Web.
 *
 * Diferente das outras plataformas, aqui o cardápio não vem de planilha: a API
 * devolve o catálogo inteiro e ele já está no banco.
 *
 * ⚠️ NÃO CRUZAR COM VENDAS. A tentativa óbvia é marcar "itens que não
 * venderam", e ela MENTE: a API devolve o cardápio de HOJE, enquanto as vendas
 * são de meses atrás. Medido na primeira loja de produção — 22 itens no
 * cardápio, 111 nomes diferentes vendidos, só 6 casando. O cardápio mudou no
 * meio do caminho, e nenhum item tem `external_code` pra cruzar por id em vez
 * de por nome. Dizer que 96% do cardápio está parado seria inventar um
 * problema que não existe.
 *
 * O que dá pra afirmar é o estado do cardápio AGORA: o que está no ar, o que
 * está desativado e o que não tem código de ficha técnica (que trava o CMV).
 */
export async function CardapioCwTab({ unitId }: { unitId: string }) {
  const admin = createAdminClient()

  const { data: itensRaw } = await admin
    .from("cardapioweb_catalogo_itens")
    .select("item_id, nome, categoria_nome, preco, ativo, external_code, synced_at")
    .eq("unit_id", unitId)
    .order("categoria_nome")
    .order("nome")

  const itens = (itensRaw ?? []) as {
    item_id: string
    nome: string | null
    categoria_nome: string | null
    preco: number | null
    ativo: boolean | null
    external_code: string | null
    synced_at: string | null
  }[]

  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <UtensilsCrossed className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Cardápio ainda não sincronizado</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          O cardápio vem sozinho pela API. Se a loja acabou de conectar, ele
          entra na próxima sincronização.
        </p>
      </div>
    )
  }

  const ativos = itens.filter((i) => i.ativo !== false)
  const desativados = itens.filter((i) => i.ativo === false)
  const precos = itens
    .map((i) => Number(i.preco))
    .filter((p) => Number.isFinite(p) && p > 0)
  const ticketCardapio =
    precos.length > 0 ? precos.reduce((a, b) => a + b, 0) / precos.length : 0
  const categorias = new Set(itens.map((i) => i.categoria_nome ?? "—")).size
  const semCodigo = itens.filter((i) => !i.external_code).length
  const sincronizado = itens.find((i) => i.synced_at)?.synced_at ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Itens no cardápio" valor={fmtNum(itens.length)} detalhe={`${categorias} categorias`} />
        <Kpi
          rotulo="No ar"
          valor={fmtNum(ativos.length)}
          detalhe="o cliente vê hoje"
        />
        <Kpi
          rotulo="Desativados"
          valor={fmtNum(desativados.length)}
          detalhe="não aparecem pro cliente"
        />
        <Kpi
          rotulo="Sem código de ficha"
          valor={fmtNum(semCodigo)}
          detalhe="trava o CMV por item"
          alerta={semCodigo > 0}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Preço médio do cardápio: <b>{fmtBRL(ticketCardapio)}</b>. Este é o
        cardápio de agora — a API não guarda como ele era em meses anteriores,
        então não dá pra cruzar com as vendas do passado.
      </p>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Itens do cardápio</h3>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Como está publicado agora no Cardápio Web.
        </p>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {itens.map((i) => (
                <tr key={i.item_id}>
                  <td className="py-2 pr-3">
                    <span
                      className={`font-medium ${i.ativo === false ? "text-muted-foreground line-through" : ""}`}
                    >
                      {i.nome ?? "—"}
                    </span>
                    {i.categoria_nome && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {i.categoria_nome}
                      </span>
                    )}
                    {!i.external_code && (
                      <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        sem código
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {i.preco != null ? fmtBRL(Number(i.preco)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sincronizado && (
        <p className="text-[11px] text-muted-foreground">
          Cardápio sincronizado em{" "}
          {new Date(sincronizado).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      )}
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          alerta ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {valor}
      </p>
      {detalhe && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{detalhe}</p>
      )}
    </div>
  )
}
