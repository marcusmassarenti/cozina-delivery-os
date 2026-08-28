"use client"

import * as React from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL } from "@/lib/format"
import type { LojaDaLista } from "@/lib/data/carteira-lojas"

type Ordenacao = "novas" | "faturamento" | "nome" | "tempo"

const CATEGORIAS = [
  {
    id: "nova" as const,
    titulo: "Lojas Novas",
    etapas: "Etapa 1 Checklist · Etapa 2 Cardápio",
  },
  { id: "ativa" as const, titulo: "Lojas Ativas", etapas: null },
  { id: "pausada" as const, titulo: "Lojas Pausadas", etapas: null },
]

/** "1 mês e 11 dias" — como no painel deles. */
function tempoDeCasa(dias: number): string {
  if (dias < 30) return `${dias} dia${dias === 1 ? "" : "s"}`
  const meses = Math.floor(dias / 30)
  const resto = dias - meses * 30
  const m = `${meses} ${meses === 1 ? "mês" : "meses"}`
  return resto === 0 ? m : `${m} e ${resto} dia${resto === 1 ? "" : "s"}`
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function LojasView({ lojas }: { lojas: LojaDaLista[] }) {
  const [busca, setBusca] = React.useState("")
  const [gestor, setGestor] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [plataforma, setPlataforma] = React.useState("")
  const [ordem, setOrdem] = React.useState<Ordenacao>("novas")

  const gestores = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lojas) if (l.gestorId && l.gestorNome) m.set(l.gestorId, l.gestorNome)
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
  }, [lojas])

  const filtradas = React.useMemo(() => {
    const q = semAcento(busca.trim())
    const out = lojas.filter((l) => {
      if (q && !semAcento(`${l.code} ${l.name}`).includes(q)) return false
      if (gestor && (gestor === "sem" ? l.gestorId !== null : l.gestorId !== gestor))
        return false
      if (status === "ativa" && !l.ativa) return false
      if (status === "inativa" && l.ativa) return false
      if (plataforma && !l.plataformas.includes(plataforma as never)) return false
      return true
    })
    const cmp: Record<Ordenacao, (a: LojaDaLista, b: LojaDaLista) => number> = {
      // Dentro de cada categoria a ordem "novas primeiro" não tem o que
      // ordenar (a categoria já é a etapa), então cai no nome.
      novas: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
      nome: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
      faturamento: (a, b) => (b.media3Meses ?? -1) - (a.media3Meses ?? -1),
      tempo: (a, b) => (b.diasEmGestao ?? -1) - (a.diasEmGestao ?? -1),
    }
    return out.sort(cmp[ordem])
  }, [lojas, busca, gestor, status, plataforma, ordem])

  const porCategoria = CATEGORIAS.map((c) => ({
    ...c,
    lojas: filtradas.filter((l) => l.categoria === c.id),
  })).filter((c) => c.lojas.length > 0)

  const sel = "h-9 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar loja"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:border-ring"
          />
        </div>
        <select value={gestor} onChange={(e) => setGestor(e.target.value)} className={sel}>
          <option value="">Todos os gestores</option>
          {gestores.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
          <option value="sem">Sem gestor</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="">Todos</option>
          <option value="ativa">Ativas</option>
          <option value="inativa">Inativas</option>
        </select>
        <select
          value={plataforma}
          onChange={(e) => setPlataforma(e.target.value)}
          className={sel}
        >
          <option value="">Todas as plataformas</option>
          <option value="ifood">iFood</option>
          <option value="99food">99Food</option>
          <option value="keeta">Keeta</option>
          <option value="cardapioweb">Cardápio Web</option>
        </select>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordenacao)}
          className={sel}
        >
          <option value="novas">Novas primeiro</option>
          <option value="faturamento">Maior faturamento</option>
          <option value="tempo">Mais tempo de casa</option>
          <option value="nome">Nome (A-Z)</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Lojas encontradas: <span className="font-semibold text-foreground">{filtradas.length}</span>
        {filtradas.length !== lojas.length && ` de ${lojas.length}`}
      </p>

      {porCategoria.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma loja com esses filtros.
        </div>
      ) : (
        porCategoria.map((c) => (
          <section key={c.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 border-b pb-2">
              <h2 className="text-sm font-semibold">Categoria: {c.titulo}</h2>
              {c.etapas && (
                <span className="text-[11px] text-muted-foreground">{c.etapas}</span>
              )}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
                {c.lojas.length} loja{c.lojas.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {c.lojas.map((l) => (
                <Cartao key={l.id} loja={l} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function Cartao({ loja: l }: { loja: LojaDaLista }) {
  return (
    <Link
      href={`/unidades/${encodeURIComponent(l.code)}`}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 transition hover:border-ring hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold uppercase">{l.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {l.gestorNome ?? "Sem gestor"}
            {l.diasEmGestao !== null && ` · ${tempoDeCasa(l.diasEmGestao)}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {l.plataformas.map((p) => (
            <PlatformLogo key={p} platform={p} className="size-5 rounded" />
          ))}
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        <div className="truncate">
          {l.promessaComercial ? (
            <span className="text-foreground">{l.promessaComercial}</span>
          ) : (
            "Sem promessa comercial"
          )}
        </div>
        <div>
          Média 3 meses:{" "}
          {/* ⚠️ Sem importação NÃO é R$ 0,00. "Não vendeu" e "não sabemos" são
              coisas diferentes, e confundir as duas é o erro que este projeto
              mais repetiu. */}
          {l.media3Meses === null ? (
            <span className="italic">sem dado importado</span>
          ) : (
            <span className="font-medium tabular-nums text-foreground">
              {fmtBRL(l.media3Meses)}
            </span>
          )}
        </div>
        {/* Só aparece quando há algo aberto. Um "0 atendimento(s)" fixo diria
            que a loja está em dia quando talvez ninguém tenha registrado nada
            — ausência de registro não é ausência de trabalho. */}
        {l.atendimentosAbertos > 0 && (
          <div className="font-medium text-amber-700 dark:text-amber-400">
            {l.atendimentosAbertos} atendimento
            {l.atendimentosAbertos === 1 ? "" : "s"} em aberto
          </div>
        )}
        {l.categoria === "nova" && (
          <div className="flex gap-2">
            <Etapa ok={l.checklistOk} label="Checklist" />
            <span>·</span>
            <Etapa ok={l.cardapioOk} label="Cardápio" />
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-1 pt-0.5">
        <Selo tom={l.categoria === "nova" ? "azul" : "cinza"}>
          {l.categoria === "nova"
            ? "Lojas Novas"
            : l.categoria === "pausada"
              ? "Pausada"
              : "Lojas Ativas"}
        </Selo>
        <Selo tom={l.ativa ? "verde" : "cinza"}>{l.ativa ? "Ativa" : "Inativa"}</Selo>
      </div>
    </Link>
  )
}

function Etapa({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}>
      {label} {ok ? "ok" : "pendente"}
    </span>
  )
}

function Selo({
  tom,
  children,
}: {
  tom: "azul" | "verde" | "cinza"
  children: React.ReactNode
}) {
  const cores = {
    azul: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    verde: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    cinza: "bg-muted text-muted-foreground",
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cores[tom]}`}>
      {children}
    </span>
  )
}
