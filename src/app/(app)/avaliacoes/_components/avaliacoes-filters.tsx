"use client"

import * as React from "react"
import { useSearchParams, usePathname } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Check, ChevronDown, Search, Star } from "lucide-react"

import { PlatformLogo, type PlatformId,
  MARKETPLACES,
} from "@/components/platform-logo"

type UnitOption = {
  code: string
  name: string
  /** Plataformas que essa unidade tem ativadas — controla quais chips aparecem */
  platforms: PlatformId[]
}

const PLATFORM_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/**
 * Filtros da tela /avaliacoes.
 * Sincroniza os search params `unidade` (code) e `plataforma`. O período
 * é gerenciado pelo PeriodSelector separado.
 *
 * Mostra os chips de plataforma só dentre as ativadas na unidade selecionada.
 */
export function AvaliacoesFilters({
  unitOptions,
  unidadeSelected,
  plataformaSelected,
}: {
  unitOptions: UnitOption[]
  unidadeSelected: string | null
  plataformaSelected: PlatformId | null
}) {
  const navigate = useNavigate()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    navigate(`${pathname}?${params.toString()}`)
  }

  function onUnidadeChange(code: string | null) {
    // Quando troca de unidade, valida se a plataforma escolhida ainda existe
    // nela; senão, limpa pra cair no default da nova unidade.
    const u = unitOptions.find((o) => o.code === code)
    const platStillValid =
      plataformaSelected && u?.platforms.includes(plataformaSelected)
    pushWith({
      unidade: code,
      plataforma: platStillValid ? plataformaSelected : null,
    })
  }

  function setPlataforma(p: PlatformId | null) {
    pushWith({ plataforma: p })
  }

  // Plataformas da visão de rede = só as habilitadas em ALGUMA loja do tenant.
  const NETWORK_PLATFORMS: PlatformId[] = (
    MARKETPLACES
  ).filter((p) => unitOptions.some((u) => u.platforms.includes(p)))

  // Filtro de estrelas (notas) — filtra a lista de comentários
  const notasSelected = (searchParams.get("notas") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => n >= 1 && n <= 5)
  function toggleNota(n: number) {
    const set = new Set(notasSelected)
    if (set.has(n)) set.delete(n)
    else set.add(n)
    const arr = [...set].sort((a, b) => a - b)
    pushWith({ notas: arr.length ? arr.join(",") : null })
  }

  const currentUnit =
    unitOptions.find((u) => u.code === unidadeSelected) ?? null
  const availablePlatforms = currentUnit?.platforms ?? []

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Unidade */}
      <SeletorUnidade
        unitOptions={unitOptions}
        selecionada={currentUnit}
        onEscolher={onUnidadeChange}
      />

      {/* Plataforma — só aparece quando há unidade escolhida e com plataformas */}
      {currentUnit && availablePlatforms.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border bg-card p-1">
          {availablePlatforms.map((p) => {
            const isActive =
              plataformaSelected === p ||
              // Default: 1ª plataforma fica ativa quando nada está selecionado
              (!plataformaSelected && p === availablePlatforms[0])
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlataforma(p)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <PlatformLogo platform={p} size="sm" />
                {PLATFORM_LABEL[p]}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro de plataforma da rede — aparece quando nenhuma unidade
          está selecionada. "Todas" soma as 3; ou escolhe uma. */}
      {!currentUnit && (
        <div className="flex items-center gap-1.5 rounded-md border bg-card p-1">
          <button
            type="button"
            onClick={() => setPlataforma(null)}
            aria-pressed={!plataformaSelected}
            className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              !plataformaSelected
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            Todas
          </button>
          {NETWORK_PLATFORMS.map((p) => {
            const isActive = plataformaSelected === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlataforma(p)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <PlatformLogo platform={p} size="sm" />
                {PLATFORM_LABEL[p]}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro de estrelas — filtra a lista de comentários (todas as telas) */}
      <div className="flex items-center gap-1 rounded-md border bg-card p-1">
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notas
        </span>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = notasSelected.includes(n)
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggleNota(n)}
              aria-pressed={active}
              title={`Comentários com nota ${n}`}
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                active
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {n}
              <Star
                className={`size-3 ${
                  active
                    ? "fill-amber-400 stroke-amber-400"
                    : "stroke-muted-foreground/50"
                }`}
              />
            </button>
          )
        })}
        {notasSelected.length > 0 && (
          <button
            type="button"
            onClick={() => pushWith({ notas: null })}
            className="ml-0.5 rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}

// Sem acento e sem caixa, senão "Açaí" só acha quem digita a cedilha certa.
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/**
 * Escolha de UMA unidade com busca por nome ou código. O Select de antes
 * obrigava a rolar a lista inteira — na DG FOODS são 50+ lojas.
 */
function SeletorUnidade({
  unitOptions,
  selecionada,
  onEscolher,
}: {
  unitOptions: UnitOption[]
  selecionada: UnitOption | null
  onEscolher: (code: string | null) => void
}) {
  const [aberto, setAberto] = React.useState(false)
  const [busca, setBusca] = React.useState("")
  const caixa = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", fora)
      document.removeEventListener("keydown", esc)
    }
  }, [aberto])

  const filtradas = React.useMemo(() => {
    const q = norm(busca.trim())
    if (!q) return unitOptions
    return unitOptions.filter(
      (u) => norm(u.name).includes(q) || u.code.toLowerCase().includes(q),
    )
  }, [unitOptions, busca])

  function escolher(code: string | null) {
    setAberto(false)
    setBusca("")
    onEscolher(code)
  }

  return (
    <div ref={caixa} className="relative min-w-[220px]">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex h-9 w-full items-center gap-1.5 rounded-md border bg-card px-3 text-left text-sm hover:bg-muted/50"
      >
        {selecionada ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="font-mono text-[10px] text-muted-foreground">
              #{selecionada.code}
            </span>{" "}
            {selecionada.name}
          </span>
        ) : (
          <span className="flex-1 text-muted-foreground">
            Escolha uma unidade…
          </span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>
      {aberto && (
        <div className="absolute left-0 z-50 mt-1 w-72 overflow-hidden rounded-md border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                // Enter com 1 resultado só = escolhe direto.
                if (e.key === "Enter" && filtradas.length === 1)
                  escolher(filtradas[0].code)
              }}
              placeholder="Buscar loja por nome ou código..."
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {selecionada && !busca && (
              <button
                type="button"
                onClick={() => escolher(null)}
                className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                Toda a rede
              </button>
            )}
            {filtradas.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                Nenhuma loja com “{busca}”.
              </p>
            )}
            {filtradas.map((u) => {
              const ativa = u.code === selecionada?.code
              return (
                <button
                  key={u.code}
                  type="button"
                  onClick={() => escolher(u.code)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted ${ativa ? "bg-primary/10" : ""}`}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{u.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {ativa && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
