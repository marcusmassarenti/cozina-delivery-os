"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  PartyPopper,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react"

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
  // "Foi conectada!" tem PRAZO DE VALIDADE. Passada a primeira semana o
  // cliente já sabe que está conectado — o aviso deixa de ser notícia e vira
  // entulho fixo na home, ocupando o lugar do faturamento do dia.
  //
  // Isto substitui o "fechar" como mecanismo principal, e de propósito: o
  // fechar mora no localStorage, então some ao trocar de navegador ou de
  // celular, e a DG FOODS tinha 47 avisos que voltavam a cada aparelho novo.
  // Prazo é servidor: vale igual em todo lugar, sem ninguém precisar clicar.
  const VALIDADE_DIAS = 7
  const corte = Date.now() - VALIDADE_DIAS * 24 * 60 * 60 * 1000
  const ativas = solicitacoes.filter(
    (s) =>
      s.status === "ativa" &&
      // Sem data legível, mostra: errar pro lado de avisar é melhor que
      // engolir a confirmação que a pessoa está esperando.
      (Number.isNaN(Date.parse(s.atualizadaEm)) ||
        Date.parse(s.atualizadaEm) >= corte),
  )
  const pendentesAprovacao = solicitacoes.filter(
    (s) => s.status === "solicitada",
  )
  // Recusada precisa aparecer AQUI. Antes ela sumia da home: o cliente
  // continuava esperando uma conexão que não vinha, e a explicação só existia
  // na página daquela loja específica — onde ele não tinha motivo pra entrar.
  const recusadas = solicitacoes.filter((s) => s.status === "recusada")
  // Conectada e SEM dado ainda = primeira carga rodando. Não tem prazo de
  // validade de 7 dias como a comemoração: enquanto o dado não chega, o aviso
  // é a única explicação pro dashboard estar vazio, e tirá-lo do ar deixaria a
  // pessoa só com a tela em branco.
  const sincronizando = solicitacoes.filter(
    (s) => s.status === "ativa" && !s.temDado,
  )
  const prontas = ativas.filter((s) => s.temDado)

  if (
    prontas.length === 0 &&
    sincronizando.length === 0 &&
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
      {/* Conectada MAS ainda sem dado é um estado próprio, e vem antes de
          qualquer comemoração: é o caso em que o cliente mais precisa de
          notícia, porque o dashboard dele está vazio neste exato momento. */}
      {sincronizando.length > 0 && <SincronizandoCard lojas={sincronizando} />}
      {prontas.length > 2 ? (
        <VariasAtivasCard lojas={prontas} />
      ) : (
        prontas.map((s) => <AtivaCard key={s.id} s={s} />)
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

/*
 * ⚠️ AVISO DE INDISPONIBILIDADE DO iFOOD — REMOVIDO EM 14/08/26, DE PROPÓSITO.
 *
 * Ficou no ar por 40 minutos. Entre 12 e 14/08, 10 lojas de 3 clientes
 * apareciam "Ativo" no Portal do Parceiro e o `GET /merchants` não devolvia
 * nenhuma delas; o card explicava ao cliente que a trava era do lado do iFood
 * e mandava importar por planilha. Às 15:45 de 14/08 as 10 voltaram na
 * listagem de uma vez só — e a partir dali o card passou a afirmar aos
 * clientes um problema que não existia mais.
 *
 * Fica registrado porque a lição não é sobre o iFood: aviso de incidente
 * escrito à mão precisa de alguém pra apagar, e quem escreve nunca é quem está
 * olhando na hora em que resolve. Se voltar a acontecer, o caminho é o card
 * nascer amarrado a um fato que o sistema mede sozinho (ex.: solicitação
 * aberta há mais de X horas com o merchant ausente da listagem), não a uma
 * data em que alguém decidiu escrever. O texto original está no commit
 * be22cd7.
 */

/**
 * "Conectado, buscando seus dados" — o estado entre o vínculo e o primeiro dado.
 *
 * SEM BOTÃO e sem "fechar", de propósito. Não há nada que o cliente possa
 * fazer pra acelerar, e um botão de "tentar de novo" só convida a clicar
 * repetido numa fila que já está andando. O que ele precisa é de duas coisas
 * que a tela antes não dava: a certeza de que estamos trabalhando (o pulso
 * animado) e QUANDO termina (o prazo escrito).
 *
 * O prazo é deliberadamente conservador — "até amanhã de manhã". O extrato do
 * iFood é gerado sob demanda e demora, e o histórico do ano inteiro vem no
 * cron da manhã. Prometer "alguns minutos" e entregar em 12 horas é pior que
 * não prometer nada: transforma espera normal em suspeita de defeito.
 *
 * Sai sozinho da tela quando o primeiro lançamento chega (`temDado`), dando
 * lugar à comemoração — que aí sim tem número por trás.
 */
function SincronizandoCard({ lojas }: { lojas: MinhaSolicitacao[] }) {
  const uma = lojas.length === 1
  return (
    <div className="flex items-start gap-3 rounded-lg border border-sky-300/60 bg-sky-50/60 px-3 py-2.5 text-sm dark:border-sky-900/40 dark:bg-sky-950/25">
      <span className="relative flex size-8 shrink-0 items-center justify-center">
        {/* Pulso por trás do ícone: diz "está rodando" sem pedir nada. */}
        <span className="absolute inline-flex size-8 animate-ping rounded-full bg-sky-400 opacity-40" />
        <span className="relative inline-flex size-8 items-center justify-center rounded-full bg-sky-600 text-white">
          <RefreshCw className="size-4 animate-spin [animation-duration:2.4s]" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {uma ? (
            <>
              Buscando os dados da{" "}
              <b>
                {lojas[0].unitCode ? `${lojas[0].unitCode} · ` : ""}
                {lojas[0].unitName}
              </b>{" "}
              no iFood…
            </>
          ) : (
            <>
              Buscando os dados de <b>{lojas.length} lojas</b> no iFood…
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          A loja já está conectada. Estamos baixando o histórico do ano e o
          faturamento — <b>aparece aqui até amanhã de manhã</b>. Não precisa
          fazer nada: a gente te avisa por e-mail quando terminar.
        </p>
        {/* QUAIS lojas, não só quantas.
            A Prime Gestão tem 5 lojas no iFood e leu "buscando os dados de 3
            lojas" logo acima de "2 de 5 ainda dependem de planilha": os dois
            números estão certos (3 conectando + 2 na planilha = 5), mas contam
            coisas diferentes sem dizer isso, e o 3 parecia erro de contagem.
            Com os nomes na tela a pergunta "e as outras duas?" se responde
            sozinha. */}
        {!uma && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lojas
              .map((l) => `${l.unitCode ? `${l.unitCode} · ` : ""}${l.unitName}`)
              .join(" · ")}
          </p>
        )}
      </div>
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
  const [visto, setVisto] = React.useState(true)
  React.useEffect(() => {
    try {
      setVisto(localStorage.getItem(chave) === "1")
    } catch {
      setVisto(false)
    }
  }, [chave])
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
        onClick={() => {
          setVisto(true)
          try {
            localStorage.setItem(chave, "1")
          } catch {
            /* ignora */
          }
        }}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
        aria-label="Fechar"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
