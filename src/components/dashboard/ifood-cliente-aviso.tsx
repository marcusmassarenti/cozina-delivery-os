"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, Clock, ExternalLink, PartyPopper, X, XCircle } from "lucide-react"

import {
  confirmarAprovacaoIfood,
  confirmarTodasAprovacoesIfood,
  type MinhaSolicitacao,
  type SolicitacaoIfoodState,
} from "@/app/(app)/unidades/_actions-ifood-ativacao"

const PORTAL_PARCEIRO = "https://portal.ifood.com.br/apps"

/**
 * Aviso da conexão iFood na tela inicial do CLIENTE — fecha a comunicação
 * dos dois lados:
 *  - "solicitada": mostra que falta ELE aprovar no Portal do Parceiro, com um
 *    botão "Já aprovei no iFood" que avisa a equipe (acende sinal no painel).
 *  - "ativa": comemora "sua loja foi conectada!" — uma vez (guarda no
 *    navegador que já viu, pela data da ativação).
 */
export function IfoodClienteAviso({
  solicitacoes,
}: {
  solicitacoes: MinhaSolicitacao[]
}) {
  const ativas = solicitacoes.filter((s) => s.status === "ativa")
  const pendentesAprovacao = solicitacoes.filter(
    (s) => s.status === "solicitada",
  )
  // Recusada precisa aparecer AQUI. Antes ela sumia da home: o cliente
  // continuava esperando uma conexão que não vinha, e a explicação só existia
  // na página daquela loja específica — onde ele não tinha motivo pra entrar.
  const recusadas = solicitacoes.filter((s) => s.status === "recusada")
  if (
    ativas.length === 0 &&
    pendentesAprovacao.length === 0 &&
    recusadas.length === 0
  ) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      {recusadas.map((s) => (
        <RecusadaCard key={s.id} s={s} />
      ))}
      {ativas.map((s) => (
        <AtivaCard key={s.id} s={s} />
      ))}
      {/* Com mais de uma loja esperando, um card só: eram 7 avisos idênticos
          na home, cada um pedindo a mesma ação e cobrando um clique. */}
      {pendentesAprovacao.length > 1 ? (
        <VariasSolicitadasCard lojas={pendentesAprovacao} />
      ) : (
        pendentesAprovacao.map((s) => <SolicitadaCard key={s.id} s={s} />)
      )}
    </div>
  )
}

function AtivaCard({ s }: { s: MinhaSolicitacao }) {
  const [visto, setVisto] = React.useState(true)
  React.useEffect(() => {
    try {
      setVisto(localStorage.getItem(`ifood_ativou_${s.id}`) === s.atualizadaEm)
    } catch {
      setVisto(false)
    }
  }, [s.id, s.atualizadaEm])
  if (visto) return null
  function fechar() {
    setVisto(true)
    try {
      localStorage.setItem(`ifood_ativou_${s.id}`, s.atualizadaEm)
    } catch {
      /* ignora */
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2.5 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/25">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <PartyPopper className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          Sua loja{" "}
          <b>
            {s.unitCode ? `${s.unitCode} · ` : ""}
            {s.unitName}
          </b>{" "}
          foi conectada ao iFood! 🎉
        </p>
        <p className="text-xs text-muted-foreground">
          <b>Financeiro</b> e <b>avaliações</b> agora entram sozinhos pela API —
          histórico e dados novos, sem planilha.
        </p>
      </div>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-100 hover:text-foreground dark:hover:bg-emerald-900/40"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function BotaoConfirmar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
    >
      <CheckCircle2 className="size-3.5" />
      {pending ? "Enviando…" : "Já aprovei no iFood"}
    </button>
  )
}

function BotaoConfirmarTodas({ n }: { n: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
    >
      <CheckCircle2 className="size-3.5" />
      {pending ? "Enviando…" : `Já aprovei as ${n}`}
    </button>
  )
}

/** Várias lojas esperando aprovação: um aviso, uma ação. */
function VariasSolicitadasCard({ lojas }: { lojas: MinhaSolicitacao[] }) {
  const router = useRouter()
  const [state, action] = useActionState<SolicitacaoIfoodState, FormData>(
    confirmarTodasAprovacoesIfood,
    { ok: false },
  )
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  const faltam = lojas.filter((s) => !s.clienteConfirmou)
  if (faltam.length === 0 || state.ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-2.5 text-sm dark:border-sky-900/40 dark:bg-sky-950/20">
        <CheckCircle2 className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <p className="text-muted-foreground">
          Recebemos que você aprovou no iFood — estamos finalizando a conexão
          de <b className="text-foreground">{lojas.length} lojas</b>. Você é
          avisado aqui quando ficarem prontas.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-2.5 text-sm dark:border-sky-900/40 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <p className="min-w-0 flex-1 text-muted-foreground">
          <b className="text-foreground">
            {faltam.length} lojas esperando sua aprovação no iFood
          </b>{" "}
          — o Proprietário aceita o app Delivery OS no Portal do Parceiro, uma
          por uma.
        </p>
        <a
          href={PORTAL_PARCEIRO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-950/40"
        >
          Abrir Portal
          <ExternalLink className="size-3" />
        </a>
        <form action={action}>
          <BotaoConfirmarTodas n={faltam.length} />
        </form>
      </div>
      <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
        {faltam
          .map((s) => `${s.unitCode ? `${s.unitCode} · ` : ""}${s.unitName}`)
          .join(" · ")}
      </p>
    </div>
  )
}

function SolicitadaCard({ s }: { s: MinhaSolicitacao }) {
  const router = useRouter()
  const [state, action] = useActionState<SolicitacaoIfoodState, FormData>(
    confirmarAprovacaoIfood,
    { ok: false },
  )
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  // Já confirmou: só informa que está em finalização.
  if (s.clienteConfirmou || state.ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-2.5 text-sm dark:border-sky-900/40 dark:bg-sky-950/20">
        <CheckCircle2 className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <p className="text-muted-foreground">
          Recebemos que você aprovou a{" "}
          <b className="text-foreground">
            {s.unitCode ? `${s.unitCode} · ` : ""}
            {s.unitName}
          </b>{" "}
          no iFood — estamos finalizando a conexão. Você é avisado aqui quando
          ficar pronta.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-2.5 text-sm dark:border-sky-900/40 dark:bg-sky-950/20">
      <Clock className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <b className="text-foreground">Falta você aprovar no iFood</b> a conexão
        da loja{" "}
        <b className="text-foreground">
          {s.unitCode ? `${s.unitCode} · ` : ""}
          {s.unitName}
        </b>{" "}
        — o Proprietário aceita o app Delivery OS no Portal do Parceiro.
      </p>
      <a
        href={PORTAL_PARCEIRO}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-950/40"
      >
        Abrir Portal
        <ExternalLink className="size-3" />
      </a>
      <form action={action}>
        <input type="hidden" name="unit_id" value={s.unitId} />
        <BotaoConfirmar />
      </form>
    </div>
  )
}

/**
 * "Não deu certo, e é por isso." O motivo é o conteúdo do card — sem ele o
 * aviso só transfere a angústia. O link leva pra loja, que é onde fica o
 * botão de solicitar de novo.
 */
function RecusadaCard({ s }: { s: MinhaSolicitacao }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs dark:border-rose-900 dark:bg-rose-950/30">
      <XCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
      <span className="text-rose-900 dark:text-rose-200">
        <b>Não foi possível conectar o iFood da {s.unitName}.</b>{" "}
        {s.nota ?? "Confira o CNPJ e solicite de novo."}
      </span>
      <Link
        href={`/unidades/${s.unitCode ?? ""}`}
        className="ml-auto shrink-0 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/40"
      >
        Corrigir e pedir de novo
      </Link>
    </div>
  )
}
