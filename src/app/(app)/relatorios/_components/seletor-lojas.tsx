"use client"

import * as React from "react"
import { Check, ChevronDown, Search, Store } from "lucide-react"

export type LojaOpcao = { code: string; name: string }

/** Tira acento e caixa — "Açaí" acha por "acai". */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

/**
 * Seletor de lojas dos relatórios, com busca.
 *
 * ── POR QUE A BUSCA ────────────────────────────────────────────────────
 * A DG FOODS tem 75 lojas. Achar uma numa lista rolável de 75 nomes
 * parecidos ("Santo Peixe - Comida Japonesa", "Suki Temakeria - Comida
 * Japonesa", "Kawaii Poke - Comida Japonesa"…) é o tipo de tarefa que faz
 * a pessoa desistir do filtro e olhar a rede inteira.
 *
 * ── POR QUE UM COMPONENTE, E NÃO TRÊS CÓPIAS ───────────────────────────
 * O mesmo seletor estava escrito à mão em `evolucao-filters`,
 * `produtos-filters` e `comparativo-filters`. Hoje mesmo, três vezes, o
 * defeito do dia foi a regra certa existir num arquivo e a cópia do lado
 * não ter recebido — o filtro da demo, a fila do backfill, a chave do
 * upsert. Escrever a quarta cópia seria plantar o próximo.
 *
 * A busca casa por NOME e por CÓDIGO: quem sabe o número digita o número.
 * "Selecionar todas" respeita o que está filtrado — com "japon" na busca,
 * ele marca as japonesas, que é o que a pessoa quer nesse instante; sem
 * busca, marca tudo, como antes.
 */
export function SeletorLojas({
  units,
  selecionadas,
  onChange,
  rotulo,
  rotuloLimpar = "Rede toda",
}: {
  units: LojaOpcao[]
  selecionadas: Set<string>
  onChange: (next: Set<string>) => void
  rotulo: string
  /** Texto do "limpar seleção". Difere entre as telas ("Rede toda" na
   *  Evolução, "Todas" em Produtos) e mudar isso na migração seria trocar
   *  a palavra que o usuário conhece por causa de uma refatoração. */
  rotuloLimpar?: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const [busca, setBusca] = React.useState("")

  const filtradas = React.useMemo(() => {
    const q = normalizar(busca)
    if (!q) return units
    return units.filter(
      (u) => normalizar(u.name).includes(q) || normalizar(u.code).includes(q),
    )
  }, [units, busca])

  const toggle = (code: string) => {
    const next = new Set(selecionadas)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange(next)
  }

  /* Fechar limpa a busca: reabrir com o filtro de ontem faz a lista parecer
     incompleta, e a pessoa não lembra que digitou. */
  const fechar = () => {
    setAberto(false)
    setBusca("")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        className="inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-md border bg-card px-2.5 text-xs font-medium"
      >
        <span className="inline-flex items-center gap-1.5">
          <Store className="size-3.5 text-muted-foreground" />
          {rotulo}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={fechar} />
          <div className="absolute top-full z-20 mt-1 flex max-h-80 w-64 flex-col rounded-md border bg-popover shadow-lg">
            {/* A busca fica FORA da área que rola: com ela junto da lista,
                rolar até a 40ª loja tirava o campo da tela e o texto
                digitado sumia de vista. */}
            <div className="border-b p-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar loja ou código…"
                  className="h-8 w-full rounded border bg-background pl-7 pr-2 text-xs outline-none focus:border-ring"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {rotuloLimpar}
              </button>
              {/* Some quando a busca não achou nada: "Selecionar as 0" é um
                  botão que promete uma ação e não faz nenhuma. */}
              {filtradas.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(new Set(filtradas.map((u) => u.code)))}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  {busca
                    ? `Selecionar as ${filtradas.length}`
                    : "Selecionar todas"}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-1">
              {filtradas.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  Nenhuma loja com “{busca}”.
                </p>
              ) : (
                filtradas.map((u) => {
                  const on = selecionadas.has(u.code)
                  return (
                    <button
                      key={u.code}
                      type="button"
                      onClick={() => toggle(u.code)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input"
                        }`}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="truncate">
                        {u.name}{" "}
                        <span className="text-muted-foreground">#{u.code}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
