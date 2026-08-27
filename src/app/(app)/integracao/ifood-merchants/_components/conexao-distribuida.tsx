"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Copy, KeyRound, Link2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  concluirVinculoDistribuido,
  descartarConexaoDistribuida,
  gerarCodigoDistribuido,
  type DistribuidoState,
} from "../_actions-distribuido"

export type UnidadeOpcao = {
  id: string
  code: string
  name: string
  holdingName: string
  /** Já conectada pelo app centralizado — ver o aviso no seletor. */
  noCentralizado: boolean
}

export type ConexaoDist = {
  id: string
  unitLabel: string
  holdingName: string
  userCode: string | null
  verificationUrl: string | null
  expiraEm: string | null
  status: "aguardando" | "ativa" | "expirada" | "revogada"
  merchantId: string | null
  erro: string | null
}

const ROTULO: Record<ConexaoDist["status"], { txt: string; tom: string }> = {
  aguardando: {
    txt: "esperando o lojista",
    tom: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  ativa: {
    txt: "autorizada",
    tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  expirada: {
    txt: "descartada",
    tom: "bg-muted text-muted-foreground",
  },
  revogada: {
    txt: "o lojista tirou o app",
    tom: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
}

function Copiavel({ valor, label }: { valor: string; label: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(valor)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1400)
      }}
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copiado ? "copiado" : label}
    </button>
  )
}

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={pending}>
      {pending ? "..." : children}
    </Button>
  )
}

/**
 * App DISTRIBUÍDO do iFood — o lojista autoriza sozinho, sem o Portal do
 * Desenvolvedor.
 *
 * ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────
 * No app centralizado (o das 108 lojas de hoje), conectar loja nova exige
 * alguém entrar no Portal do DESENVOLVEDOR e pedir autorização por CNPJ — e o
 * resultado não é determinístico. Em 13/ago o lojista aprovou às 17:47 e a API
 * seguiu devolvendo 403 quarenta minutos depois; a Tech Assessoria ficou dez
 * lojas travadas por dias e voltou sem o iFood explicar o quê.
 *
 * Aqui o passo que falta é uma ação do lojista, que a gente vê acontecer. A
 * troca é honesta: perde-se a autorização automática (ele precisa devolver um
 * código), ganha-se previsibilidade.
 *
 * ⚠️ FICA FECHADA E FORA DA FILA. As três abas em cima são o trabalho de todo
 * dia; isto é um caminho novo, em teste numa loja. Competir com a fila faria a
 * página perder o que ela responde.
 */
export function ConexaoDistribuida({
  unidades,
  conexoes,
  configurado,
}: {
  unidades: UnidadeOpcao[]
  conexoes: ConexaoDist[]
  configurado: boolean
}) {
  const [gerar, acaoGerar] = useActionState<DistribuidoState, FormData>(
    gerarCodigoDistribuido,
    { ok: false },
  )
  const [concluir, acaoConcluir] = useActionState<DistribuidoState, FormData>(
    concluirVinculoDistribuido,
    { ok: false },
  )
  const [, acaoDescartar] = useActionState<DistribuidoState, FormData>(
    descartarConexaoDistribuida,
    { ok: false },
  )
  const [unidade, setUnidade] = React.useState("")

  const abertas = conexoes.filter((c) => c.status === "aguardando")
  const resto = conexoes.filter((c) => c.status !== "aguardando")

  return (
    <details className="mt-4 rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <KeyRound className="size-4 text-orange-500" />
        Conexão direta com o lojista (app distribuído)
        {abertas.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {abertas.length} esperando
          </span>
        )}
      </summary>

      <div className="flex flex-col gap-4 border-t px-4 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Em vez de pedir a autorização por CNPJ no Portal do Desenvolvedor, a
          gente gera um código e manda um link pro lojista. Ele autoriza na
          conta dele, o portal devolve um segundo código, e ele te manda esse
          código de volta — é o que fecha a conexão. Cada loja fica com o
          próprio token.
        </p>

        {!configurado ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            O app distribuído não está configurado neste ambiente — faltam
            IFOOD_DIST_CLIENT_ID e IFOOD_DIST_CLIENT_SECRET.
          </p>
        ) : (
          <form action={acaoGerar} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="unitId" value={unidade} />
            {/* Loja SEM conexão primeiro. Este caminho existe pra loja nova,
                e com 130 opções em ordem alfabética a que interessa fica
                perdida no meio das que já estão conectadas. */}
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring sm:max-w-[320px]"
            >
              <option value="">Escolher a loja…</option>
              <optgroup label="Ainda sem iFood conectado">
                {unidades
                  .filter((u) => !u.noCentralizado)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name} · {u.holdingName}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Já conectadas pelo app centralizado">
                {unidades
                  .filter((u) => u.noCentralizado)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name} · {u.holdingName}
                    </option>
                  ))}
              </optgroup>
            </select>
            <Enviar>Gerar código</Enviar>
          </form>
        )}

        {/* Escolher uma já conectada não é proibido — pode ser justamente a
            intenção, migrar uma loja pra testar. Mas precisa ser escolha, não
            distração: as duas credenciais no mesmo merchant seriam chamada e
            log em dobro contra o mesmo teto de rate limit. */}
        {unidade && unidades.find((u) => u.id === unidade)?.noCentralizado && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Essa loja já está conectada pelo app centralizado. Uma loja usa um
            caminho ou o outro — se seguir, desvincule o merchant dela antes de
            deixar o sync rodar pelos dois.
          </p>
        )}

        {gerar.error && (
          <p className="text-xs text-rose-600">{gerar.error}</p>
        )}
        {gerar.ok && gerar.message && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {gerar.message}
          </p>
        )}

        {abertas.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{c.unitLabel}</span>
              <span className="text-[11px] text-muted-foreground">
                {c.holdingName}
              </span>
              {c.expiraEm && (
                <span className="text-[11px] text-amber-800 dark:text-amber-400">
                  · código vale até {c.expiraEm}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-md border bg-background px-2.5 py-1 font-mono text-sm font-semibold tracking-wider">
                {c.userCode ?? "—"}
              </code>
              {c.verificationUrl && (
                <Copiavel valor={c.verificationUrl} label="copiar o link do lojista" />
              )}
            </div>

            {/* O código de volta é o passo que depende de outra pessoa. Fica
                logo abaixo do link, na mesma caixa, pra quem voltar amanhã
                não precisar procurar onde cola. */}
            <form
              action={acaoConcluir}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="conexaoId" value={c.id} />
              <input
                name="authorizationCode"
                placeholder="cole aqui o código que o lojista devolveu"
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring sm:max-w-[340px]"
              />
              <Enviar>
                <Link2 className="size-3" />
                Concluir
              </Enviar>
            </form>

            <form action={acaoDescartar} className="mt-2">
              <input type="hidden" name="conexaoId" value={c.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              >
                <Trash2 className="size-3" />
                descartar esta tentativa
              </button>
            </form>

            {c.erro && (
              <p className="mt-2 text-[11px] text-rose-600">{c.erro}</p>
            )}
          </div>
        ))}

        {concluir.error && (
          <p className="text-xs text-rose-600">{concluir.error}</p>
        )}
        {concluir.ok && concluir.message && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {concluir.message}
          </p>
        )}

        {resto.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {resto.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-xs font-medium">{c.unitLabel}</span>
                <span className="text-[11px] text-muted-foreground">
                  {c.holdingName}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROTULO[c.status].tom}`}
                >
                  {ROTULO[c.status].txt}
                </span>
                {c.merchantId && (
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {c.merchantId.slice(0, 8)}…
                  </code>
                )}
                {c.erro && (
                  <span className="text-[10px] text-rose-600">{c.erro}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {conexoes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma loja usa esse caminho ainda. As demais seguem no app
            centralizado, sem mudança.
          </p>
        )}
      </div>
    </details>
  )
}
