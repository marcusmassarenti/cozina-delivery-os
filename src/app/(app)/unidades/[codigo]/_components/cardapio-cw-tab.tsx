import { ShoppingBasket, TrendingUp, UtensilsCrossed } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { getVendasItensCardapioWeb } from "@/lib/data/cardapioweb-operacao"
import { fmtBRL, fmtNum } from "@/lib/format"

/**
 * Aba Cardápio do Cardápio Web — o que VENDEU, no formato das abas de iFood e
 * 99: mais vendidos, menos vendidos e complementos.
 *
 * Sai dos PEDIDOS, não do catálogo. O catálogo também está no banco (a API o
 * devolve inteiro), mas é uma foto de HOJE: a API não guarda como o cardápio
 * era em meses anteriores. Cruzar os dois pra dizer "item que não vendeu"
 * MENTE — medido na primeira loja de produção, 22 itens no catálogo contra 111
 * nomes diferentes vendidos, só 6 casando, porque o cardápio mudou no meio do
 * caminho e nenhum item tem `external_code` pra cruzar por id em vez de por
 * nome.
 *
 * Por isso "menos vendidos" aqui são os que venderam POUCO — nunca os que não
 * venderam. Item que não aparece em pedido nenhum pode simplesmente não existir
 * mais no cardápio.
 *
 * Os complementos são o diferencial: estavam parados no banco desde sempre.
 * Adicional é margem alta e é o que o cliente escolhe junto.
 */
export async function CardapioCwTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [vendas, { count: itensCatalogo }] = await Promise.all([
    getVendasItensCardapioWeb([unitId], year, month),
    createAdminClient()
      .from("cardapioweb_catalogo_itens")
      .select("item_id", { count: "exact", head: true })
      .eq("unit_id", unitId),
  ])

  if (!vendas.temDados) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <UtensilsCrossed className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          Nenhum item vendido no Cardápio Web neste período.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Os itens vêm sozinhos pela API, pedido a pedido — não depende de
          importar planilha.
        </p>
      </div>
    )
  }

  const t = vendas.total
  const topItem = vendas.itens[0]
  // Rede de segurança: com MENOS de 20 itens distintos, o topo (10) e o fundo
  // (10) se encostam e um item cairia nas duas listas. O banco já usa a mesma
  // régua nos dois extremos, então aqui basta tirar a sobreposição.
  // A tabela mostra 10. Vinte linhas empurravam os dois cards de baixo pra
  // fora da tela e faziam a dobra parecer desequilibrada — tabela gigante em
  // cima, cartõezinhos embaixo. Dez é o que cabe junto com o resto.
  const TOPO = 10
  const topo = vendas.itens.slice(0, TOPO)
  const nomesTop = new Set(topo.map((i) => i.nome))
  const menos = vendas.menos.filter((i) => !nomesTop.has(i.nome)).slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icone={<UtensilsCrossed className="size-4" />}
          rotulo="Itens distintos"
          valor={fmtNum(t.itensDistintos)}
          detalhe={
            itensCatalogo
              ? `${fmtNum(itensCatalogo)} no cardápio hoje`
              : `em ${fmtNum(t.pedidos)} pedidos`
          }
        />
        <Kpi
          icone={<ShoppingBasket className="size-4" />}
          rotulo="Volume total"
          valor={fmtNum(t.unidades)}
          detalhe={`${fmtBRL(t.receita)} de receita`}
        />
        <Kpi
          icone={<TrendingUp className="size-4" />}
          rotulo="Top item"
          valor={topItem?.nome ?? "—"}
          truncar
          detalhe={
            topItem
              ? `${fmtNum(topItem.qtd)} vendidos · ${fmtBRL(topItem.receita)}`
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-baseline justify-between gap-2 border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Top itens vendidos</h3>
          <span className="text-[11px] text-muted-foreground">
            {vendas.itens.length > TOPO
              ? `${TOPO} de ${vendas.itens.length} itens`
              : `${vendas.itens.length} itens`}{" "}
            · ordenado por receita
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                <th className="px-3 py-2 text-right font-semibold">Receita</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Preço médio
                </th>
                <th className="px-5 py-2 text-right font-semibold">Pedidos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topo.map((i, idx) => (
                <tr key={`${i.nome}-${idx}`} className="hover:bg-muted/40">
                  <td className="px-5 py-2 tabular-nums text-xs text-muted-foreground">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{i.nome}</span>
                    {!i.externalCode && (
                      <span
                        title="Sem código de ficha técnica — trava o CMV por item"
                        className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      >
                        sem código
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmtNum(i.qtd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBRL(i.receita)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {i.qtd > 0 ? fmtBRL(i.receita / i.qtd) : "—"}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtNum(i.pedidos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {menos.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Os que menos saem</h3>
              <span className="text-[11px] text-muted-foreground">
                {menos.length} itens
              </span>
            </div>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              Mesma régua do topo — receita, de baixo pra cima. Venderam, mas
              renderam pouco: vale olhar preço, foto e posição na categoria.
            </p>
            <div className="space-y-1.5">
              {menos.map((i) => (
                <div
                  key={i.nome}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={i.nome}
                  >
                    {i.nome}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="font-semibold">{fmtBRL(i.receita)}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {fmtNum(i.qtd)} un
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {vendas.complementos.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Top complementos</h3>
              <span className="text-[11px] text-muted-foreground">
                {vendas.complementos.length} no período
              </span>
            </div>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              O que o cliente mais escolhe junto.
            </p>
            <div className="space-y-1.5">
              {vendas.complementos.slice(0, 10).map((c) => (
                <div
                  key={`${c.grupo}-${c.nome}`}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={c.nome}
                  >
                    {c.nome}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {c.grupo}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="font-semibold">{fmtNum(c.qtd)}</span>
                    {c.receita > 0 && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {fmtBRL(c.receita)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({
  icone,
  rotulo,
  valor,
  detalhe,
  truncar,
}: {
  icone: React.ReactNode
  rotulo: string
  valor: string
  detalhe?: string
  truncar?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icone}
        <p className="text-[10px] font-semibold uppercase tracking-wider">
          {rotulo}
        </p>
      </div>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${truncar ? "truncate text-base" : ""}`}
        title={truncar ? valor : undefined}
      >
        {valor}
      </p>
      {detalhe && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{detalhe}</p>
      )}
    </div>
  )
}
