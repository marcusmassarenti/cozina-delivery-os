"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, ChevronDown, Star, ThumbsDown, ThumbsUp } from "lucide-react"

import { avaliarResposta } from "../_actions-auto"

export type RespondidaAuto = {
  id: string
  unitId: string
  loja: string
  code: string
  nota: number
  comentario: string | null
  resposta: string
  respondidaEm: string
  voto: 1 | -1 | null
  correcao: string | null
}

const POR_PAGINA = 20

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Casca fechada como o "Esperando resposta": a contagem fica visível na linha
 * e a lista só abre no clique — ou sozinha, quando se chega pelo aviso
 * ("…/avaliacoes#respondidas").
 */
export function RespondidasAutoLista({
  itens: inicial,
  podeAvaliar,
}: {
  itens: RespondidaAuto[]
  podeAvaliar: boolean
}) {
  const [itens, setItens] = useState(inicial)
  const [aberto, setAberto] = useState(false)
  const [loja, setLoja] = useState("")
  const [mostrar, setMostrar] = useState(POR_PAGINA)

  // Chegou pelo aviso ("…#respondidas") — na carga ou já estando na tela.
  useEffect(() => {
    const ver = () => {
      if (window.location.hash === "#respondidas") setAberto(true)
    }
    // O Link do Next troca o hash por pushState, que NÃO dispara
    // "hashchange" — por isso o aviso também manda este evento próprio.
    const abrir = () => {
      setAberto(true)
      document.getElementById("respondidas")?.scrollIntoView({ behavior: "smooth" })
    }
    const t = setTimeout(ver, 0)
    window.addEventListener("hashchange", ver)
    window.addEventListener("respondidas:abrir", abrir)
    return () => {
      clearTimeout(t)
      window.removeEventListener("hashchange", ver)
      window.removeEventListener("respondidas:abrir", abrir)
    }
  }, [])

  const lojas = useMemo(
    () =>
      [...new Map(itens.map((i) => [i.unitId, `#${i.code} ${i.loja}`])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true }),
      ),
    [itens],
  )
  const filtrados = loja ? itens.filter((i) => i.unitId === loja) : itens
  const boas = itens.filter((i) => i.voto === 1).length
  const ruins = itens.filter((i) => i.voto === -1).length
  const semVoto = itens.length - boas - ruins

  function atualizar(id: string, mudar: Partial<RespondidaAuto>) {
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...mudar } : i)))
  }

  return (
    <section id="respondidas" className="scroll-mt-20 rounded-xl border bg-card shadow-sm" data-print="hide">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left hover:bg-muted/50"
      >
        <Bot className="size-4 shrink-0 text-emerald-600" />
        <span className="text-sm font-semibold">Respondidas automaticamente</span>
        <span className="text-xs text-muted-foreground">
          {itens.length} nos últimos 30 dias
          {podeAvaliar && semVoto > 0 && (
            <>
              {" · "}
              <b className="text-foreground">{semVoto}</b> esperando sua avaliação
            </>
          )}
          {boas > 0 && ` · ${boas} 👍`}
          {ruins > 0 && ` · ${ruins} 👎`}
        </span>
        <ChevronDown
          className={`ml-auto size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <div className="border-t px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <p className="min-w-0 flex-1 text-muted-foreground">
              {podeAvaliar
                ? "Diga se a resposta ficou boa. No 👎, escreva como você teria respondido — a IA passa a responder no seu jeito."
                : "O que a resposta automática publicou no iFood em nome das lojas."}
            </p>
            {lojas.length > 1 && (
              <select
                value={loja}
                onChange={(e) => {
                  setLoja(e.target.value)
                  setMostrar(POR_PAGINA)
                }}
                className="h-7 rounded-md border bg-background px-2 text-xs"
                aria-label="Filtrar por loja"
              >
                <option value="">Todas as lojas</option>
                {lojas.map(([id, rotulo]) => (
                  <option key={id} value={id}>
                    {rotulo}
                  </option>
                ))}
              </select>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {filtrados.slice(0, mostrar).map((i) => (
              <Item key={i.id} item={i} podeAvaliar={podeAvaliar} onChange={atualizar} />
            ))}
          </ul>

          {filtrados.length > mostrar && (
            <button
              type="button"
              onClick={() => setMostrar((m) => m + POR_PAGINA)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Ver mais {Math.min(POR_PAGINA, filtrados.length - mostrar)} de{" "}
              {filtrados.length - mostrar}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Item({
  item: i,
  podeAvaliar,
  onChange,
}: {
  item: RespondidaAuto
  podeAvaliar: boolean
  onChange: (id: string, mudar: Partial<RespondidaAuto>) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(i.correcao ?? "")
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  /* Voto muda NA HORA e volta se o servidor recusar — mesma lição do
     interruptor da resposta automática (25/09/26): clique que espera o
     servidor parece travado. */
  function votar(v: 1 | -1) {
    const antes = { voto: i.voto, correcao: i.correcao }
    const novo = i.voto === v ? 0 : v
    setErro(null)
    onChange(i.id, { voto: novo === 0 ? null : novo, correcao: novo === -1 ? i.correcao : null })
    setEditando(novo === -1)
    void avaliarResposta(i.id, novo, novo === -1 ? i.correcao : null).then(
      (r) => {
        if (r.ok) return
        onChange(i.id, antes)
        setEditando(false)
        setErro(r.message ?? "Não deu certo.")
      },
      () => {
        onChange(i.id, antes)
        setErro("Não deu certo — tente de novo.")
      },
    )
  }

  async function salvarCorrecao() {
    setSalvando(true)
    setErro(null)
    const r = await avaliarResposta(i.id, -1, texto).catch(() => null)
    setSalvando(false)
    if (!r?.ok) {
      setErro(r?.message ?? "Não deu certo — tente de novo.")
      return
    }
    onChange(i.id, { voto: -1, correcao: texto.trim() || null })
    setEditando(false)
  }

  return (
    <li className="rounded-lg border px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-muted px-1 text-[10px] font-bold tabular-nums text-muted-foreground">
          #{i.code}
        </span>
        <span className="font-medium">{i.loja}</span>
        <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`Nota ${i.nota}`}>
          {i.nota}
          <Star className="size-3 fill-current" />
        </span>
        <span className="text-muted-foreground">{quando(i.respondidaEm)}</span>

        {podeAvaliar && (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => votar(1)}
              aria-pressed={i.voto === 1}
              aria-label="Resposta boa"
              className={`rounded-md border p-1 transition-colors ${
                i.voto === 1
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => votar(-1)}
              aria-pressed={i.voto === -1}
              aria-label="Resposta ruim"
              className={`rounded-md border p-1 transition-colors ${
                i.voto === -1
                  ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <ThumbsDown className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      {i.comentario && <p className="mt-1.5 italic text-foreground/80">“{i.comentario}”</p>}
      <p className="mt-1 text-muted-foreground">↳ {i.resposta}</p>

      {i.voto === -1 && !editando && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {i.correcao ? (
            <p className="text-rose-700 dark:text-rose-400">
              Como você teria respondido: <span className="text-foreground">{i.correcao}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">Marcada como ruim.</p>
          )}
          {podeAvaliar && (
            <button
              type="button"
              onClick={() => {
                setTexto(i.correcao ?? "")
                setEditando(true)
              }}
              className="font-medium text-primary hover:underline"
            >
              {i.correcao ? "Editar" : "Escrever como eu responderia"}
            </button>
          )}
        </div>
      )}

      {editando && podeAvaliar && (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="Como você teria respondido? (opcional — a IA aprende o seu jeito com isso)"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={salvarCorrecao}
              className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border px-2.5 py-1 font-medium hover:bg-muted"
            >
              Agora não
            </button>
            <span className="text-[11px] text-muted-foreground">
              Não altera o que já está no iFood.
            </span>
          </div>
        </div>
      )}

      {erro && <p className="mt-1 text-destructive">{erro}</p>}
    </li>
  )
}
