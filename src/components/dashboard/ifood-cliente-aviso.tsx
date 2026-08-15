"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, Clock, ExternalLink, PartyPopper, X, XCircle } from "lucide-react"

import { useMarcaNavegador } from "@/components/shared/use-marca-navegador"
import {
  confirmarAprovacaoIfood,
  confirmarTodasAprovacoesIfood,
  reportarLojaNaoApareceu,
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
  // "Foi conectada!" tem PRAZO DE VALIDADE de 7 dias, e quem o aplica é o
  // SERVIDOR (ver `getMinhasSolicitacoesIfood`): as ativas que chegam aqui já
  // estão dentro da janela. O relógio não pode morar nesta renderização —
  // `Date.now()` durante o render dá um corte no servidor e outro no
  // navegador, e uma loja bem na fronteira dos 7 dias aparece num e some no
  // outro, que é hydration mismatch.
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
      {/* Mesmo tratamento das solicitadas, que já tinha sido resolvido aqui em
          cima e não chegou nas ativas: a DG FOODS abriu a home com 47 avisos
          de "loja conectada", um por loja, empurrando o faturamento do dia pra
          fora da tela. Comemorar 47 vezes não é comemorar — é entulho. */}
      {ativas.length > 2 ? (
        <VariasAtivasCard lojas={ativas} />
      ) : (
        ativas.map((s) => <AtivaCard key={s.id} s={s} />)
      )}
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
  // `noServidor: true` = presume já visto e não renderiza no servidor. A
  // comemoração erra pro lado de não aparecer: melhor ela chegar um instante
  // depois da hidratação do que piscar na tela de quem já a viu.
  //
  // O valor guardado é a DATA da ativação, não "1": reconectou a loja, a data
  // muda e o aviso volta — que é o comportamento que já existia aqui.
  const [visto, fechar] = useMarcaNavegador("local", `ifood_ativou_${s.id}`, {
    valor: s.atualizadaEm,
    noServidor: true,
  })
  if (visto) return null
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
      {/* A saída pro caso "essa loja nem apareceu pra eu aprovar". Sem ela a
          linha ficava presa em 'solicitada' pra sempre: o cliente aprovava o
          que via, e a que faltou não voltava pro radar de ninguém. */}
      <BotaoNaoApareceu id={s.id} />
    </div>
  )
}

/** Devolve a solicitação pra fila interna como "sua vez". */
function BotaoNaoApareceu({ id }: { id: string }) {
  const router = useRouter()
  const [state, action] = useActionState<SolicitacaoIfoodState, FormData>(
    reportarLojaNaoApareceu,
    { ok: false },
  )
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  if (state.ok) {
    return (
      <span className="basis-full text-[11px] text-emerald-700 dark:text-emerald-400">
        {state.message}
      </span>
    )
  }
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <BotaoNaoApareceuSubmit />
      {state.message && !state.ok && (
        <span className="ml-2 text-[11px] text-rose-700 dark:text-rose-400">
          {state.message}
        </span>
      )}
    </form>
  )
}

function BotaoNaoApareceuSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
      title="Use quando a loja não aparecer pra aprovar no seu Portal do Parceiro"
    >
      {pending ? "avisando..." : "não apareceu pra aprovar"}
    </button>
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


/**
 * "N lojas foram conectadas" — um card no lugar de N.
 *
 * O individual (AtivaCard) continua valendo pra uma ou duas: ali o nome da
 * loja é a informação, e ver "Le Petit Pastéis conectada" é a confirmação que
 * a pessoa esperava. A partir de três o nome deixa de informar e vira lista —
 * então o que importa passa a ser o número e o "pode parar de subir planilha".
 *
 * Um "fechar" só, e ele vale por todas: dispensar 47 avisos um a um é uma
 * tarefa que ninguém faz, e aviso que não se consegue dispensar vira parte do
 * cenário — deixa de ser lido justamente quando algo importante aparecer nele.
 */
function VariasAtivasCard({ lojas }: { lojas: MinhaSolicitacao[] }) {
  // A chave inclui a contagem: conectou mais uma, o aviso volta com o número
  // novo. Sem isso, quem fechou com 47 nunca mais saberia da 48ª.
  const chave = `ifood_ativou_lote_${lojas.length}`
  const [visto, fechar] = useMarcaNavegador("local", chave, {
    noServidor: true,
  })
  if (visto) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2.5 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/25">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <PartyPopper className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          <b>{lojas.length} lojas</b> foram conectadas ao iFood! 🎉
        </p>
        <p className="text-xs text-muted-foreground">
          Financeiro e avaliações entram sozinhos pela API — histórico e dados
          novos, sem planilha.{" "}
          <span
            title={lojas
              .map((l) => `${l.unitCode ? `${l.unitCode} · ` : ""}${l.unitName}`)
              .join("\n")}
            className="underline decoration-dotted underline-offset-2"
          >
            Ver quais
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={fechar}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
        aria-label="Fechar"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
