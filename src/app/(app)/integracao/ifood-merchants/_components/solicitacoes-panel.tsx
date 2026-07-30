"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Copy, Check, Undo2 } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"

import {
  atualizarSolicitacaoIfood,
  conferirLojasAutorizadas,
  desfazerStatusIfood,
  marcarLancadoNoPortal,
  type ConferirAutorizadasState,
  type SolicitacaoUpdateState,
} from "../_actions"

export type SolicitacaoAdmin = {
  id: string
  cnpj: string
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  nota: string | null
  holdingName: string
  unitLabel: string | null
  createdAt: string
  /** Quando o cliente apertou "Já aprovei no iFood" (sinal pra vincular). */
  clienteConfirmouAt: string | null
  /** Passo anterior da fila — habilita o Desfazer. */
  statusAnterior: string | null
  /** Você já lançou este CNPJ no Portal do Desenvolvedor? */
  lancadoNoPortal: boolean
}

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}

function BotaoStatus({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "..." : rotulo}
    </Button>
  )
}

function CopiarCnpj({ cnpj }: { cnpj: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(cnpj)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
      title="Copiar CNPJ (só dígitos) pra colar no Portal do Desenvolvedor"
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copiado ? "copiado" : "copiar"}
    </button>
  )
}

/** Uma linha da fila com as transições de status possíveis. */
function Linha({ s }: { s: SolicitacaoAdmin }) {
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    atualizarSolicitacaoIfood,
    { ok: false },
  )

  // Recusada não tem "próximo status", mas precisa do Desfazer — senão o
  // bloco de ações inteiro some e o clique errado fica sem volta.
  const podeDesfazer = Boolean(s.statusAnterior) || s.status === "recusada"

  // "Loja vinculada — ativar" saiu daqui de propósito. Era do tempo em que o
  // vínculo era manual; hoje quem conecta é o cron diário (ou o botão do
  // topo), e manter o botão fazia parecer que faltava uma ação do operador —
  // que ao clicar só recebia "esta loja ainda não apareceu no nosso app".
  // Em "solicitada" a bola está com o CLIENTE: a única saída manual é recusar.
  const proximas: Array<{ status: string; rotulo: string }> =
    s.status === "pendente"
      ? [{ status: "solicitada", rotulo: "Marquei como solicitada" }]
      : []

  /** Recusar é uma ação à parte: ela pede o aviso que o cliente vai ler. */
  const podeRecusar = s.status === "pendente" || s.status === "solicitada"
  /** Só faz sentido riscar da lista o que ainda depende de você lançar. */
  const podeMarcarLancado = podeRecusar
  const jaRecusada = s.status === "recusada"

  // Fecha o campo assim que a gravação passa: depois de salvar, o aviso vira
  // texto de novo. Deixar a caixa aberta dava a impressão de que não salvou.
  const [editando, setEditando] = React.useState(false)
  React.useEffect(() => {
    if (state.ok) setEditando(false)
  }, [state.ok])

  return (
    <div
      className={`rounded-lg border p-3 ${s.lancadoNoPortal ? "border-dashed bg-muted/10 opacity-70" : "bg-muted/20"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`tabular-nums ${s.lancadoNoPortal ? "text-muted-foreground line-through" : "font-medium"}`}
        >
          {fmtCnpj(s.cnpj)}
        </span>
        <CopiarCnpj cnpj={s.cnpj} />
        {podeMarcarLancado && <BotaoLancado id={s.id} lancado={s.lancadoNoPortal} />}
        {s.unitLabel && (
          <span className="text-muted-foreground">{s.unitLabel}</span>
        )}
        {s.status === "solicitada" && s.clienteConfirmouAt && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            ✋ cliente confirmou
          </span>
        )}
        {/* De quem é a vez — a dúvida mais comum ao olhar esta fila. */}
        {s.status === "pendente" && (
          <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
            sua vez
          </span>
        )}
        {s.status === "solicitada" && !s.clienteConfirmouAt && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            com o cliente
          </span>
        )}
        <span
          className={`${s.status === "solicitada" && s.clienteConfirmouAt ? "" : "ml-auto"} rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
        >
          {s.status}
        </span>
      </div>

      {/* O aviso salvo, em texto — é literalmente o que o cliente lê. */}
      {jaRecusada && !editando && (
        <p className="mt-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {s.nota ?? "Sem aviso escrito — o cliente vê só o texto padrão."}
        </p>
      )}

      {(proximas.length > 0 || podeRecusar || jaRecusada || podeDesfazer) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {proximas.map((p) => (
            <form key={p.status} action={action}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value={p.status} />
              <BotaoStatus rotulo={p.rotulo} />
            </form>
          ))}

          {/* O campo do aviso fica GUARDADO até você decidir recusar.
              Aberto o tempo todo, ele aparecia em toda linha da fila — inclusive
              nas que estão só esperando o cliente aprovar — e a tela virava um
              mural de caixas de texto vermelhas em lojas que não têm problema
              nenhum. Aqui ele só existe quando é a hora dele. */}
          {(podeRecusar || jaRecusada) &&
            (editando ? (
              <form action={action} className="flex flex-1 basis-full items-center gap-2">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value="recusada" />
                <input
                  type="text"
                  name="nota"
                  autoFocus
                  defaultValue={
                    s.nota ??
                    "Não foi possível localizar a loja com esse CNPJ — confira o CNPJ cadastrado no iFood e solicite de novo."
                  }
                  placeholder="O que o cliente vai ler"
                  className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1 text-[11px]"
                />
                <BotaoStatus rotulo={jaRecusada ? "Salvar aviso" : "Confirmar recusa"} />
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  cancelar
                </button>
              </form>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => setEditando(true)}
              >
                {jaRecusada ? "Editar aviso" : "Recusar"}
              </Button>
            ))}
          {/* Recusada sempre pode voltar; sem histórico, volta pro início. */}
          {podeDesfazer && (
            <BotaoDesfazer id={s.id} para={s.statusAnterior ?? "pendente"} />
          )}
          {s.status === "pendente" && (
            <span className="text-[11px] text-muted-foreground">
              → Portal do Desenvolvedor · Meus Apps · Permissões · buscar pelo
              CNPJ
            </span>
          )}
          {s.status === "solicitada" && (
            <span
              className={`text-[11px] ${s.clienteConfirmouAt ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
            >
              {/* O texto genérico "nada a fazer daqui" saiu: repetido em 12
                  linhas iguais, ele triplicava a altura da fila e escondia o
                  que era específico de cada loja. Agora só aparece o que muda
                  de linha pra linha. */}
              {s.clienteConfirmouAt
                ? 'O cliente avisou que já aprovou — use "Já autorizei — conferir e vincular" no topo.'
                : ""}
            </span>
          )}
        </div>
      )}

      {state.error && (
        <p className="mt-1 text-[11px] text-rose-600">{state.error}</p>
      )}
    </div>
  )
}

/**
 * Volta a solicitação pro passo anterior da fila.
 *
 * "Recusar" fica colado em "Loja vinculada — ativar", e o clique errado não é
 * cosmético: recusada some do aviso da home do cliente, então ele deixa de ser
 * lembrado de aprovar no Portal do Parceiro e a conexão morre calada.
 */
function BotaoDesfazer({ id, para }: { id: string; para: string }) {
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    desfazerStatusIfood,
    { ok: false },
  )
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={`Volta para "${para}"`}
      >
        <Undo2 className="size-3" />
        Desfazer
      </button>
      {state.error && (
        <span className="text-[11px] text-rose-600">{state.error}</span>
      )}
    </form>
  )
}

/**
 * "Já autorizei — conferir e vincular": vai buscar os merchants no iFood e
 * casa com as solicitações abertas, de uma vez.
 *
 * Substitui o vai-e-vem de descer na tabela e vincular loja por loja. Depois
 * que o cliente aprova no Portal do Parceiro a loja demora alguns minutos pra
 * aparecer no nosso GET /merchants — até aqui, a única forma de fechar o ciclo
 * antes do cron da madrugada era manual.
 */
function BotaoConferir() {
  const [state, action] = useActionState<ConferirAutorizadasState, FormData>(
    conferirLojasAutorizadas,
    { ok: false },
  )
  const nada =
    state.ok &&
    (state.vinculadas?.length ?? 0) === 0 &&
    (state.pendentes?.length ?? 0) === 0 &&
    (state.restantes ?? 0) === 0

  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <BotaoConferirSubmit />
        <span className="text-[11px] text-muted-foreground">
          Depois que o cliente aprova no Portal do Parceiro, a loja leva alguns
          minutos pra aparecer aqui. Este botão vai buscar e vincula sozinho.
        </span>
      </form>

      {state.error && (
        <p className="mt-2 text-[11px] text-rose-600">{state.error}</p>
      )}

      {state.ok && (state.vinculadas?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-md bg-emerald-50 p-2 dark:bg-emerald-950/30">
          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
            {state.vinculadas!.length} loja
            {state.vinculadas!.length > 1 ? "s" : ""} vinculada
            {state.vinculadas!.length > 1 ? "s" : ""} e ativada
            {state.vinculadas!.length > 1 ? "s" : ""}:
          </p>
          <ul className="mt-1 space-y-0.5">
            {state.vinculadas!.map((v) => (
              <li
                key={v.code}
                className="text-[11px] text-emerald-700 dark:text-emerald-400"
              >
                #{v.code} {v.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.ok && (state.pendentes?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 dark:bg-amber-950/30">
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">
            Estas ficaram de fora — resolva na tabela abaixo:
          </p>
          <ul className="mt-1 space-y-0.5">
            {state.pendentes!.map((a) => (
              <li
                key={a.name}
                className="text-[11px] text-amber-700 dark:text-amber-400"
              >
                {a.name} — {a.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.ok && (state.restantes ?? 0) > 0 && (
        <p className="mt-2 text-[11px] font-medium text-sky-700 dark:text-sky-400">
          Faltaram {state.restantes} — clique de novo pra continuar. Cada rodada
          descobre o CNPJ de mais lojas e a próxima fica mais rápida.
        </p>
      )}

      {nada && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nenhuma loja nova apareceu ainda
          {typeof state.merchantsVistos === "number"
            ? ` (${state.merchantsVistos} autorizadas no app)`
            : ""}
          . Se o cliente acabou de aprovar, espere uns minutos e clique de novo.
        </p>
      )}
    </div>
  )
}

function BotaoConferirSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Conferindo no iFood..." : "Já autorizei — conferir e vincular"}
    </Button>
  )
}

export function SolicitacoesPanel({
  solicitacoes,
}: {
  solicitacoes: SolicitacaoAdmin[]
}) {
  // Loja já ativa = jornada concluída → sai da fila (continua visível como
  // "Vinculado" na tabela de merchants abaixo). A fila mostra só o que ainda
  // precisa de ação: pendente, solicitada e recusada.
  const naFila = solicitacoes.filter((s) => s.status !== "ativa")
  if (naFila.length === 0) return null
  const abertas = naFila.filter(
    (s) => s.status === "pendente" || s.status === "solicitada",
  )
  const recusadas = naFila.filter((s) => s.status === "recusada")
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">
        Solicitações de conexão dos clientes
        {abertas.length > 0 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            {abertas.length} aguardando
          </span>
        )}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pedidos feitos pelos clientes na tela de importação. Fluxo: copiar o
        CNPJ → solicitar no Portal do Desenvolvedor → marcar como solicitada →
        quando o cliente aprovar e a loja aparecer aqui, vincular à unidade e
        ativar. Loja conectada sai desta lista (fica como <b>Vinculado</b> na
        tabela abaixo).
      </p>
      {abertas.length > 0 && <BotaoConferir />}

      {/* Agrupado POR CLIENTE porque o trabalho é por cliente: você abre o
          Portal do Desenvolvedor uma vez e despacha o lote dele inteiro. Solto,
          um lote de 14 lojas ficava intercalado com o de outro cliente e era
          impossível saber onde você tinha parado. */}
      <Grupo titulo="Aguardando" itens={abertas} />
      <Grupo titulo="Recusadas" itens={recusadas} />
    </div>
  )
}

/**
 * Um bloco da fila. Separar aguardando de recusada importa porque são duas
 * perguntas diferentes: "o que ainda tenho que despachar?" e "o que travou e
 * precisa de resposta?". Misturadas, a segunda some no meio da primeira.
 */
function Grupo({
  titulo,
  itens,
}: {
  titulo: string
  itens: SolicitacaoAdmin[]
}) {
  if (itens.length === 0) return null
  const aguardando = titulo === "Aguardando"
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </h3>
        <span className="text-[10px] text-muted-foreground">{itens.length}</span>
      </div>
      <div className="space-y-4">
        {[...new Map(itens.map((s) => [s.holdingName, true])).keys()].map(
          (cliente) => {
            const doCliente = itens.filter((s) => s.holdingName === cliente)
            const aLancar = doCliente
              .filter(
                (s) =>
                  !s.lancadoNoPortal &&
                  (s.status === "pendente" || s.status === "solicitada"),
              )
              .map((s) => s.cnpj)
            return (
              <div key={cliente}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold">{cliente}</h3>
                  <span className="text-[10px] text-muted-foreground">
                    {doCliente.length} loja{doCliente.length > 1 ? "s" : ""}
                    {aLancar.length > 0 && ` · ${aLancar.length} a lançar`}
                  </span>
                  {aguardando && <CopiarLote cnpjs={aLancar} />}
                </div>
                {/* A explicação vive AQUI, uma vez por cliente. */}
                {aguardando &&
                  doCliente.some((s) => s.status === "solicitada") && (
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      As marcadas como <b>solicitada</b> dependem do
                      Proprietário aprovar no Portal do Parceiro dele — a
                      conexão se fecha sozinha (checamos uma vez por dia; pra
                      não esperar, use o botão acima).
                    </p>
                  )}
                <div className="space-y-2">
                  {doCliente.map((s) => (
                    <Linha key={s.id} s={s} />
                  ))}
                </div>
              </div>
            )
          },
        )}
      </div>
    </div>
  )
}

/**
 * O risco na lista: "esse CNPJ eu já lancei no portal".
 *
 * O Portal do Desenvolvedor aceita um CNPJ por vez e não devolve nada que dê
 * pra ler de volta. Com 14 lojas de um cliente só, o operador perdia o fio de
 * quais já tinham passado — e loja pulada vira loja esquecida. Isto é o
 * caderninho que faltava, dentro da própria fila.
 */
function BotaoLancado({ id, lancado }: { id: string; lancado: boolean }) {
  const [, action] = useActionState<SolicitacaoUpdateState, FormData>(
    marcarLancadoNoPortal,
    { ok: false },
  )
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="marcar" value={lancado ? "0" : "1"} />
      <BotaoLancadoSubmit lancado={lancado} />
    </form>
  )
}

function BotaoLancadoSubmit({ lancado }: { lancado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
        lancado
          ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
          : "text-muted-foreground hover:bg-muted"
      }`}
      title={
        lancado
          ? "Desmarcar — voltar pra lista de CNPJs a lançar"
          : "Marcar que você já lançou este CNPJ no Portal do Desenvolvedor"
      }
    >
      {lancado ? <Check className="size-3" /> : null}
      {pending ? "..." : lancado ? "lancei" : "marcar lançada"}
    </button>
  )
}

/** Todos os CNPJs que ainda faltam lançar deste cliente, de uma vez só. */
function CopiarLote({ cnpjs }: { cnpjs: string[] }) {
  const [copiado, setCopiado] = React.useState(false)
  if (cnpjs.length === 0) return null
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(cnpjs.join("\n"))
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copiado ? "copiados" : `copiar os ${cnpjs.length} que faltam`}
    </button>
  )
}
