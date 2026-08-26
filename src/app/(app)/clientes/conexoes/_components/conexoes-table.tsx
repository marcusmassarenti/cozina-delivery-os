"use client"

import * as React from "react"
import Link from "next/link"
import {
  Building2,
  Check,
  ChevronRight,
  Minus,
  Plug,
  Search,
} from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { gerarConviteAction } from "@/app/(app)/integracao/cardapioweb/_actions"

export type ConexaoRow = {
  unitId: string
  unitCode: string | null
  unitName: string
  cidade: string | null
  ativa: boolean
  cliente: string
  clienteId: string
  platforms: PlatformId[]
  ifoodApi: boolean
  ninefoodApi: boolean
  /** Instalação de produção ativa e vinculada — o "via API" do canal próprio. */
  cardapiowebApi: boolean
  /**
   * Cliente suspenso ou trial vencido sem loja — régua única em
   * @/lib/data/cliente-arquivado. Fica FORA da tela principal e das contagens
   * do topo: conexão de quem não é mais cliente inflava "75 de 85 via API" e
   * fazia o painel parecer melhor do que é.
   */
  arquivado: boolean
}

const PLATS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
  { id: "cardapioweb", label: "Cardápio Web" },
]

/** Plataformas que têm coluna de "conectada por API". Keeta ainda não tem. */
const COM_API = ["ifood", "99food", "cardapioweb"] as const
type ComApi = (typeof COM_API)[number]

const ROTULO_API: Record<ComApi, string> = {
  ifood: "iFood",
  "99food": "99",
  cardapioweb: "Cardápio Web",
}

export function ConexoesTable({ rows }: { rows: ConexaoRow[] }) {
  const [query, setQuery] = React.useState("")
  // Plataformas habilitadas exigidas (AND) + conexões de API exigidas (AND).
  const [platSel, setPlatSel] = React.useState<Set<PlatformId>>(new Set())
  const [apiSel, setApiSel] = React.useState<Set<ComApi>>(new Set())
  // Clientes abertos. Com 500 lojas, a lista inteira aberta é ilegível — então
  // cada cliente nasce fechado e a pessoa abre o que quer olhar.
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set())
  // Mesma divisão da tela de Clientes, de propósito: quem já conhece uma
  // reconhece a outra.
  const [escopo, setEscopo] = React.useState<"ativos" | "arquivados">("ativos")
  const arquivadas = React.useMemo(
    () => rows.filter((r) => r.arquivado).length,
    [rows],
  )
  // TUDO nesta tela — contagem do topo, filtros e lista — enxerga só o escopo
  // escolhido. Filtrar apenas a lista deixaria o resumo contando loja que a
  // pessoa não está vendo.
  const noEscopo = React.useMemo(
    () => rows.filter((r) => r.arquivado === (escopo === "arquivados")),
    [rows, escopo],
  )

  const togglePlat = (p: PlatformId) =>
    setPlatSel((s) => {
      const n = new Set(s)
      n.has(p) ? n.delete(p) : n.add(p)
      return n
    })
  const toggleApi = (p: ComApi) =>
    setApiSel((s) => {
      const n = new Set(s)
      n.has(p) ? n.delete(p) : n.add(p)
      return n
    })

  // Contagens por plataforma (habilitada) e por API — pro resumo do topo.
  const stats = React.useMemo(() => {
    const s = {
      ifood: { total: 0, api: 0 },
      "99food": { total: 0, api: 0 },
      keeta: { total: 0 },
      cardapioweb: { total: 0, api: 0 },
    }
    for (const r of noEscopo) {
      if (r.platforms.includes("ifood")) s.ifood.total++
      if (r.platforms.includes("99food")) s["99food"].total++
      if (r.platforms.includes("keeta")) s.keeta.total++
      if (r.platforms.includes("cardapioweb")) s.cardapioweb.total++
      if (r.ifoodApi) s.ifood.api++
      if (r.ninefoodApi) s["99food"].api++
      if (r.cardapiowebApi) s.cardapioweb.api++
    }
    return s
  }, [noEscopo])

  const filtradas = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return noEscopo.filter((r) => {
      for (const p of platSel) if (!r.platforms.includes(p)) return false
      if (apiSel.has("ifood") && !r.ifoodApi) return false
      if (apiSel.has("99food") && !r.ninefoodApi) return false
      if (apiSel.has("cardapioweb") && !r.cardapiowebApi) return false
      if (!q) return true
      return (
        r.unitName.toLowerCase().includes(q) ||
        r.cliente.toLowerCase().includes(q) ||
        (r.cidade ?? "").toLowerCase().includes(q) ||
        (r.unitCode ?? "").toLowerCase().includes(q)
      )
    })
  }, [noEscopo, query, platSel, apiSel])

  // Agrupa por cliente. Uma tabela corrida com 500 lojas é ilegível: ninguém
  // acha a loja de um cliente no meio das outras, e o scroll vira o trabalho.
  const grupos = React.useMemo(() => {
    const m = new Map<string, { nome: string; id: string; lojas: ConexaoRow[] }>()
    for (const r of filtradas) {
      const g = m.get(r.clienteId) ?? { nome: r.cliente, id: r.clienteId, lojas: [] }
      g.lojas.push(r)
      m.set(r.clienteId, g)
    }
    return [...m.values()].sort(
      (a, b) => b.lojas.length - a.lojas.length || a.nome.localeCompare(b.nome, "pt-BR"),
    )
  }, [filtradas])

  const temFiltro = platSel.size > 0 || apiSel.size > 0
  const buscando = query.trim().length > 0 || temFiltro

  return (
    <div className="flex flex-col gap-3">
      {/* Ativos × Arquivados. A aba só aparece quando existe arquivado: numa
          base sem nenhum, seria uma escolha permanente entre "tudo" e "nada". */}
      {arquivadas > 0 && (
        <div className="flex items-center gap-1 border-b">
          {([
            { k: "ativos" as const, r: "Ativos", n: rows.length - arquivadas },
            { k: "arquivados" as const, r: "Suspensos e arquivados", n: arquivadas },
          ]).map((e) => (
            <button
              key={e.k}
              type="button"
              onClick={() => setEscopo(e.k)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                escopo === e.k
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {e.r}{" "}
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                {e.n}
              </span>
            </button>
          ))}
        </div>
      )}

      {escopo === "arquivados" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          Clientes suspensos ou com teste vencido sem loja. As conexões seguem
          gravadas, mas <b>o sync não puxa mais</b> depois de 7 dias suspenso —
          e elas não entram na contagem da aba Ativos.
        </p>
      )}

      {/* Resumo por plataforma — clicável (também filtra). */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border bg-card px-2.5 py-1 font-medium">
          {noEscopo.length} loja{noEscopo.length !== 1 ? "s" : ""}
        </span>
        {PLATS.map((p) => {
          const st = stats[p.id]
          const api = "api" in st ? st.api : null
          const on = platSel.has(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePlat(p.id)}
              title={`Filtrar lojas com ${p.label}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${
                on
                  ? "border-primary bg-primary/10 text-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <PlatformLogo platform={p.id} size="sm" />
              {st.total} loja{st.total !== 1 ? "s" : ""}
              {api != null && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  · {api} via API
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Busca + filtros de API */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar loja, cliente ou cidade…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {COM_API.map((p) => {
            const on = apiSel.has(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleApi(p)}
                title={`Só lojas conectadas via API do ${ROTULO_API[p]}`}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "hover:bg-muted"
                }`}
              >
                <Plug className="size-3" />
                {ROTULO_API[p]} via API
              </button>
            )
          })}
          {temFiltro && (
            <button
              type="button"
              onClick={() => {
                setPlatSel(new Set())
                setApiSel(new Set())
              }}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
          Nenhuma loja encontrada.
        </div>
      ) : (
        grupos.map((g) => {
          // Buscando, o grupo abre sozinho: um resultado escondido atrás de um
          // acordeão fechado parece busca quebrada.
          const aberto = buscando || abertos.has(g.id)
          const viaApi = g.lojas.filter(
            (l) => l.ifoodApi || l.ninefoodApi || l.cardapiowebApi,
          ).length
          return (
            <div
              key={g.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setAbertos((s) => {
                    const n = new Set(s)
                    n.has(g.id) ? n.delete(g.id) : n.add(g.id)
                    return n
                  })
                }
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <ChevronRight
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                    aberto ? "rotate-90" : ""
                  }`}
                />
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-semibold">{g.nome}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {g.lojas.length} loja{g.lojas.length !== 1 ? "s" : ""}
                </span>
                {viaApi > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {viaApi} via API
                  </span>
                )}
              </button>

              {aberto && (
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5 font-semibold">Loja</th>
                        <th className="px-4 py-2.5 font-semibold">Plataformas</th>
                        <th className="px-3 py-2.5 text-center font-semibold">
                          iFood API
                        </th>
                        <th className="px-3 py-2.5 text-center font-semibold">
                          99 API
                        </th>
                        <th className="px-3 py-2.5 text-center font-semibold">
                          Cardápio Web
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {g.lojas.map((r) => (
                        <tr key={r.unitId} className="hover:bg-muted/40">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                                {r.unitCode ?? "—"}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-medium">
                                    {r.unitName}
                                  </span>
                                  {!r.ativa && (
                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                      inativa
                                    </span>
                                  )}
                                </div>
                                {r.cidade && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {r.cidade}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {r.platforms.length === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              ) : (
                                r.platforms.map((p) => (
                                  <PlatformLogo key={p} platform={p} size="sm" />
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <ApiCell on={r.ifoodApi} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <ApiCell on={r.ninefoodApi} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <CelulaCw row={r} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function ApiCell({ on }: { on: boolean }) {
  return on ? (
    <span
      title="Conectada via API"
      className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  ) : (
    <span
      title="Sem API — importação de planilha"
      className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground/50"
    >
      <Minus className="size-3.5" />
    </span>
  )
}

/**
 * Célula do Cardápio Web: status + o botão de convite quando falta conectar.
 *
 * ── POR QUE AQUI (Marcus, 27/08/26) ──────────────────────────────────────
 * "eu como dono do sistema preciso na minha tela poder gerar para outros
 * clientes". O botão existia só em /integracao/cardapioweb, que é a tela do
 * TENANT — serve pro cliente se conectar sozinho, não pro Marcus resolver pelo
 * cliente. Esta tela já lista toda loja de todo cliente com o status por
 * plataforma, então é onde a pergunta "quem falta conectar?" já é respondida.
 *
 * O botão só aparece quando a loja DECLAROU usar Cardápio Web e ainda NÃO está
 * conectada — que é exatamente a lista de quem cutucar. Em loja conectada ou
 * que não usa o canal, ele seria ruído.
 */
function CelulaCw({ row }: { row: ConexaoRow }) {
  const [gerando, setGerando] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)

  const declarou = row.platforms.includes("cardapioweb")
  if (row.cardapiowebApi || !declarou) return <ApiCell on={row.cardapiowebApi} />

  if (url) {
    return (
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(url)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        }}
        title={url}
        className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
      >
        {copiado ? "copiado!" : "copiar link"}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={gerando}
      onClick={async () => {
        setGerando(true)
        setErro(null)
        try {
          const r = await gerarConviteAction(row.unitId, "producao")
          if (r.ok && r.url) setUrl(r.url)
          else setErro(r.message ?? "não deu")
        } finally {
          setGerando(false)
        }
      }}
      title="Gera o link pro dono da loja autorizar — ele não precisa de conta aqui"
      className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
    >
      {gerando ? "..." : (erro ?? "gerar link")}
    </button>
  )
}
