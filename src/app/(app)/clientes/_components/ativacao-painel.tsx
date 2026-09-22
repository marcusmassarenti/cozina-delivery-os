"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Mail, MessageCircle, Rocket } from "lucide-react"

import type { ClienteAtivacao, EtapaAtivacao } from "@/lib/data/ativacao"

/**
 * A fila de ativação — quem se cadastrou e ainda não assinou, e o que falta
 * pra cada um ver o primeiro número. Ver `lib/data/ativacao.ts`.
 *
 * ── FEITO PRA 50 CLIENTES, NÃO PRA 5 (Marcus, 22/09/26) ─────────────────
 * A primeira versão tinha uma linha alta por cliente, com os 4 degraus e o
 * botão cheio — com 5 cadastros já ocupava a tela. Agora:
 *   • as etapas viram FILTRO no topo, com a contagem (a pergunta "quantos
 *     estão travados sem loja?" se responde sem ler a lista);
 *   • uma linha fina por cliente, ORDENADA por urgência — o que depende de
 *     nós (iFood parado com a gente) primeiro, depois quem tem o teste
 *     acabando antes, depois os vencidos;
 *   • só os 8 primeiros abertos; o resto atrás de "ver todos".
 */

type Filtro = "todos" | Exclude<EtapaAtivacao, "assinou">

const ETAPAS: { id: Exclude<EtapaAtivacao, "assinou">; rotulo: string; cls: string }[] = [
  {
    id: "sem_loja",
    rotulo: "Sem loja",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  {
    id: "sem_dado",
    rotulo: "Sem número",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  {
    id: "sem_conexao",
    rotulo: "Sem conexão",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
  },
  {
    id: "pronto_pra_assinar",
    rotulo: "Pronto pra assinar",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  },
]
const ETAPA_POR_ID = Object.fromEntries(ETAPAS.map((e) => [e.id, e]))

const VISIVEIS = 8

const dm = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—"

export function AtivacaoPainel({ clientes }: { clientes: ClienteAtivacao[] }) {
  const [filtro, setFiltro] = React.useState<Filtro>("todos")
  const [todos, setTodos] = React.useState(false)
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  if (clientes.length === 0) return null

  // Urgência: iFood parado do NOSSO lado → teste acabando antes → vencidos
  // (o mais recente primeiro: é o que ainda dá pra resgatar).
  const ordenados = [...clientes].sort((a, b) => {
    const nossaA = a.ifoodEspera === "nossa" ? 0 : 1
    const nossaB = b.ifoodEspera === "nossa" ? 0 : 1
    if (nossaA !== nossaB) return nossaA - nossaB
    const venceuA = a.fimDoTeste != null && a.fimDoTeste < hoje ? 1 : 0
    const venceuB = b.fimDoTeste != null && b.fimDoTeste < hoje ? 1 : 0
    if (venceuA !== venceuB) return venceuA - venceuB
    const fa = a.fimDoTeste ?? "9999"
    const fb = b.fimDoTeste ?? "9999"
    return venceuA ? fb.localeCompare(fa) : fa.localeCompare(fb)
  })
  const filtrados =
    filtro === "todos" ? ordenados : ordenados.filter((c) => c.etapa === filtro)
  const mostrados = todos ? filtrados : filtrados.slice(0, VISIVEIS)
  const nossaCulpa = clientes.filter((c) => c.ifoodEspera === "nossa").length

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <Rocket className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Ativação</p>
        <p className="text-xs text-muted-foreground">
          {clientes.length} em teste · cadastros dos últimos 60 dias que ainda
          não assinaram
        </p>
        {nossaCulpa > 0 && (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10.5px] font-semibold text-white">
            {nossaCulpa} iFood esperando a gente
          </span>
        )}
        {/* As etapas SÃO o filtro: a contagem responde "onde está o gargalo". */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <BotaoFiltro
            ativo={filtro === "todos"}
            onClick={() => setFiltro("todos")}
            rotulo="Todos"
            n={clientes.length}
          />
          {ETAPAS.map((e) => (
            <BotaoFiltro
              key={e.id}
              ativo={filtro === e.id}
              onClick={() => setFiltro(e.id)}
              rotulo={e.rotulo}
              n={clientes.filter((c) => c.etapa === e.id).length}
            />
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="px-4 py-4 text-center text-xs text-muted-foreground">
          Ninguém nesta etapa.
        </p>
      ) : (
        <div className="divide-y text-xs">
          {mostrados.map((c) => {
            const e = ETAPA_POR_ID[c.etapa]
            const venceu = c.fimDoTeste != null && c.fimDoTeste < hoje
            const parado = c.diasSemEntrar ?? c.diasDesdeCadastro
            return (
              <div
                key={c.holdingId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-muted/30"
              >
                <Link
                  href={`/clientes/${c.holdingId}`}
                  className="min-w-0 max-w-[220px] truncate font-semibold hover:underline"
                  title={c.contato.nome ?? undefined}
                >
                  {c.empresa}
                </Link>
                {e && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${e.cls}`}
                  >
                    {e.rotulo}
                  </span>
                )}
                {c.ifoodEspera === "nossa" && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                    iFood com a gente
                  </span>
                )}
                {c.ifoodEspera === "cliente" && (
                  <span className="text-[11px] text-muted-foreground">
                    iFood: falta ele aprovar
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                  <span>
                    {c.lojas} loja{c.lojas === 1 ? "" : "s"}
                  </span>
                  <span className={parado >= 2 ? "font-medium text-rose-600 dark:text-rose-400" : ""}>
                    {c.ultimoAcesso ? `entrou há ${parado}d` : "nunca entrou"}
                  </span>
                  {c.fimDoTeste && (
                    <span className={venceu ? "font-medium text-rose-600 dark:text-rose-400" : ""}>
                      {venceu ? `venceu ${dm(c.fimDoTeste)}` : `teste até ${dm(c.fimDoTeste)}`}
                    </span>
                  )}
                </span>
                {c.whatsappLink ? (
                  <a
                    href={c.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Chamar ${c.contato.nome ?? "o cliente"} no WhatsApp com a mensagem desta etapa`}
                    aria-label="Chamar no WhatsApp"
                    className="inline-flex size-7 items-center justify-center rounded-md bg-[#25D366] text-white hover:opacity-90"
                  >
                    <MessageCircle className="size-3.5" />
                  </a>
                ) : c.contato.email ? (
                  <a
                    href={`mailto:${c.contato.email}`}
                    title="Não informou WhatsApp no cadastro"
                    aria-label="Mandar e-mail"
                    className="inline-flex size-7 items-center justify-center rounded-md border hover:bg-muted"
                  >
                    <Mail className="size-3.5" />
                  </a>
                ) : (
                  <span className="size-7" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {filtrados.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setTodos((t) => !t)}
          className="flex w-full items-center justify-center gap-1 border-t py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
        >
          <ChevronDown className={`size-3.5 transition-transform ${todos ? "rotate-180" : ""}`} />
          {todos ? "Mostrar só os mais urgentes" : `Ver todos (${filtrados.length})`}
        </button>
      )}
    </div>
  )
}

function BotaoFiltro({
  ativo,
  onClick,
  rotulo,
  n,
}: {
  ativo: boolean
  onClick: () => void
  rotulo: string
  n: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      disabled={n === 0 && !ativo}
      className={`rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition-colors disabled:opacity-40 ${
        ativo ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
      }`}
    >
      {rotulo} {n}
    </button>
  )
}
