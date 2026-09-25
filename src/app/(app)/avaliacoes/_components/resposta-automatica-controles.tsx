"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bot, ChevronDown, Loader2 } from "lucide-react"

import { fmtBRL } from "@/lib/format"

import {
  definirNotasRespostaAuto,
  definirRespostaAutomatica,
  responderPendentesAgora,
} from "../_actions-auto"

type Loja = { id: string; code: string; name: string; ativa: boolean }

export function RespostaAutomaticaControles({
  lojas,
  iaDesligada,
  exemplos,
  feitas,
  precoLoja,
  emTeste,
  notas,
}: {
  lojas: Loja[]
  /** O cliente desligou a IA da conta — a automática não roda. */
  iaDesligada: boolean
  exemplos: { nota: number; comentario: string; resposta: string | null }[]
  feitas: { modelo: number; ia: number; puladas: number }
  /** Preço do adicional por loja ligada (0 = cortesia). */
  precoLoja: number
  /** Teste grátis: liga sem cobrar. */
  emTeste: boolean
  /** Estrelas que a automática responde (escolha do cliente). */
  notas: number[]
}) {
  const router = useRouter()
  const [pendente, start] = useTransition()
  const [rodando, startRodar] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [aberta, setAberta] = useState(false)

  const ligadas = lojas.filter((l) => l.ativa).length
  const todas = ligadas === lojas.length
  const cobra = precoLoja > 0 && !emTeste
  // Ligar loja acrescenta valor à mensalidade: pede confirmação com o número
  // na tela. Desligar não pede — tirar cobrança nunca precisa de freio.
  const [confirmar, setConfirmar] = useState<string[] | null>(null)

  function pedir(ids: string[], ativa: boolean) {
    const novas = ids.filter((id) => !lojas.find((l) => l.id === id)?.ativa)
    if (ativa && cobra && novas.length > 0) {
      setMsg(null)
      setConfirmar(novas)
      return
    }
    alterar(ids, ativa)
  }

  function alterar(ids: string[], ativa: boolean) {
    setMsg(null)
    setConfirmar(null)
    start(async () => {
      const r = await definirRespostaAutomatica(ids, ativa)
      if (!r.ok) setMsg(r.message ?? "Não deu certo.")
      router.refresh()
    })
  }

  // Estado LOCAL das estrelas, alinhado ao que o servidor confirma. Ler a
  // prop a cada clique deixou tela e banco diferentes em dois cliques rápidos
  // (a prop ainda era a de antes do primeiro). Um clique por vez, e a tela
  // passa a mostrar o que ficou gravado.
  const [notasSel, setNotasSel] = useState<number[]>(notas)
  const [salvandoNotas, startNotas] = useTransition()

  function trocarNota(n: number) {
    if (salvandoNotas) return
    const nova = notasSel.includes(n)
      ? notasSel.filter((x) => x !== n)
      : [...notasSel, n]
    if (nova.length === 0) {
      setMsg("Escolha pelo menos uma nota.")
      return
    }
    setMsg(null)
    const antes = notasSel
    setNotasSel(nova)
    startNotas(async () => {
      const r = await definirNotasRespostaAuto(nova)
      if (!r.ok) {
        setNotasSel(antes)
        setMsg(r.message ?? "Não deu certo.")
        return
      }
      if (r.notas) setNotasSel([...r.notas].sort())
    })
  }

  const notasTxt = [...notasSel].sort().join(", ").replace(/, (\d)$/, " e $1")
  const temBaixa = notasSel.some((n) => n <= 3)

  function rodarAgora() {
    setMsg(null)
    startRodar(async () => {
      const r = await responderPendentesAgora()
      if (!r.ok) {
        setMsg(r.message ?? "Não deu certo.")
        return
      }
      setMsg(
        r.respondidas === 0 && r.puladas === 0
          ? "Nenhuma avaliação nota 4 ou 5 esperando resposta nas lojas ligadas."
          : `${r.respondidas} respondida${r.respondidas === 1 ? "" : "s"} agora` +
              (r.puladas
                ? ` · ${r.puladas} ficaram pra você (reclamação ou recusadas pelo iFood)`
                : "") +
              (r.paradoPorTempo ? " · o resto sai na rotina de amanhã" : "") +
              ".",
      )
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Resposta automática · notas {notasTxt} do iFood
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Todo dia de manhã, as avaliações com essas notas, nas lojas ligadas,
            são respondidas sozinhas. As outras — e os casos delicados — aparecem
            num aviso pra alguém responder.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Responder notas:</span>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = notasSel.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  disabled={salvandoNotas}
                  onClick={() => trocarNota(n)}
                  className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 font-medium tabular-nums transition-colors disabled:opacity-60 ${
                    on
                      ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {n}★
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Adicional:{" "}
            {precoLoja === 0 ? (
              <b className="text-foreground">cortesia</b>
            ) : (
              <>
                <b className="text-foreground">{fmtBRL(precoLoja)}</b> por loja
                ligada, por mês
                {emTeste
                  ? " · grátis durante o teste"
                  : ligadas > 0
                    ? ` · hoje ${fmtBRL(precoLoja * ligadas)}/mês na sua mensalidade`
                    : ""}
              </>
            )}
          </p>
          <p className="mt-1 text-xs tabular-nums">
            <b>
              {ligadas} de {lojas.length}
            </b>{" "}
            loja{lojas.length === 1 ? "" : "s"} ligada{ligadas === 1 ? "" : "s"}
            {feitas.modelo + feitas.ia > 0 && (
              <>
                {" "}
                · últimos 30 dias:{" "}
                <b className="text-emerald-600">{feitas.modelo + feitas.ia}</b>{" "}
                respondidas
                {feitas.ia > 0 && ` (${feitas.ia} com IA)`}
                {feitas.puladas > 0 && ` · ${feitas.puladas} deixadas pra você`}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={() => pedir(lojas.map((l) => l.id), !todas)}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          >
            {todas ? "Desligar todas" : "Ligar todas"}
          </button>
          {ligadas > 0 && (
            <button
              type="button"
              disabled={rodando}
              onClick={rodarAgora}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {rodando && <Loader2 className="size-3.5 animate-spin" />}
              Responder as pendentes agora
            </button>
          )}
        </div>
      </div>

      {confirmar && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-amber-50 px-4 py-2.5 text-xs dark:bg-amber-950/20">
          <span className="min-w-0 flex-1">
            Ligar {confirmar.length} loja{confirmar.length === 1 ? "" : "s"}{" "}
            acrescenta <b>{fmtBRL(precoLoja * confirmar.length)}/mês</b> à sua
            mensalidade, a partir da próxima fatura. Dá pra desligar quando
            quiser.
          </span>
          <button
            type="button"
            disabled={pendente}
            onClick={() => alterar(confirmar, true)}
            className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            Contratar e ligar
          </button>
          <button
            type="button"
            onClick={() => setConfirmar(null)}
            className="rounded-md border px-2.5 py-1 font-medium hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      {iaDesligada && ligadas > 0 && (
        <p className="border-t bg-rose-50 px-4 py-2 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
          A IA está desligada nesta conta — a resposta automática não roda até
          ela ser religada.
        </p>
      )}

      {msg && (
        <p className="border-t bg-muted/30 px-4 py-2 text-xs">{msg}</p>
      )}

      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        className="flex w-full items-center gap-1.5 border-t px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
      >
        <ChevronDown
          className={`size-3.5 transition-transform ${aberta ? "rotate-180" : ""}`}
        />
        {aberta ? "Esconder regras e lojas" : "Ver como funciona, exemplos e lojas"}
      </button>

      {aberta && (
        <div className="grid gap-4 border-t p-4 text-xs lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="font-semibold">Como decide</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>
                  O iFood só deixa responder avaliação{" "}
                  <b className="text-foreground">com comentário</b> — as sem
                  comentário ele publica na hora.
                </li>
                <li>
                  <b className="text-foreground">Elogio:</b> a IA agradece pelo
                  que a pessoa destacou.
                </li>
                <li>
                  <b className="text-foreground">Crítica</b>
                  {temBaixa ? "" : " (numa nota escolhida)"}: pede desculpas e
                  diz que vai levar pra equipe — sem prometer reembolso, cupom,
                  desconto nem mudança de preço.
                </li>
                <li>
                  <b className="text-foreground">Sempre fica pra você</b>, em
                  qualquer nota: saúde, higiene ou comida estragada, item
                  faltando, pedido de reembolso, Procon ou ofensa.
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">Exemplos de resposta</p>
              <ul className="mt-1 space-y-1.5">
                {exemplos.map((e, i) => (
                  <li key={i} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-amber-500">{"★".repeat(e.nota)}</span>{" "}
                    <span className="italic">&ldquo;{e.comentario}&rdquo;</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {e.resposta ? (
                        <>↳ {e.resposta}</>
                      ) : (
                        <b className="text-amber-700 dark:text-amber-400">
                          ↳ não responde — caso delicado, fica pra você
                        </b>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <p className="font-semibold">Lojas</p>
            <ul className="mt-1 max-h-72 divide-y overflow-y-auto rounded-md border">
              {lojas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className="mr-1 rounded bg-muted px-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                      #{l.code}
                    </span>
                    {l.name}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={l.ativa}
                    aria-label={`Resposta automática em ${l.name}`}
                    disabled={pendente}
                    onClick={() => pedir([l.id], !l.ativa)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                      l.ativa ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                        l.ativa ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
