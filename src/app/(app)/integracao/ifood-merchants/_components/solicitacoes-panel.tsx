"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ChevronRight, Copy, Check, Undo2 } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"

import { combina } from "./abas"
import {
  atualizarSolicitacaoIfood,
  compartilharLojaExistente,
  conferirLojasAutorizadas,
  desfazerStatusIfood,
  marcarLancadoNoPortal,
  pausarAutomacaoSolicitacao,
  type ConferirAutorizadasState,
  type SolicitacaoUpdateState,
} from "../_actions"

export type SolicitacaoAdmin = {
  id: string
  cnpj: string
  /** "arquivada" = resolvida; não chega aqui (a query da fila filtra fora). */
  status: "pendente" | "solicitada" | "ativa" | "recusada" | "arquivada"
  nota: string | null
  holdingName: string
  /** Id da empresa que pediu — usado pra não oferecer loja dela mesma no
   *  compartilhamento. */
  holdingId: string | null
  unitLabel: string | null
  createdAt: string
  /** Quando o cliente apertou "Já aprovei no iFood" (sinal pra vincular). */
  clienteConfirmouAt: string | null
  /** Passo anterior da fila — habilita o Desfazer. */
  statusAnterior: string | null
  /** Você já lançou este CNPJ no Portal do Desenvolvedor? */
  lancadoNoPortal: boolean
  /**
   * Motivo da pausa na régua automática, ou null quando a régua está normal.
   * Pausada = não cobra confirmação em 1 dia nem recusa sozinha em 3.
   */
  pausadaMotivo: string | null
}

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}

/**
 * UM status por loja, e ele responde "de quem é a vez".
 *
 * Antes eram duas etiquetas lado a lado: "COM O CLIENTE" e "SOLICITADA". As
 * duas dizem a mesma coisa — a segunda é o nome interno do estado, que só
 * significa algo pra quem conhece o fluxo. Com 100 lojas na tela, cada linha
 * gastava dois selos pra entregar uma informação, e a que importa (de quem é a
 * vez) ficava do mesmo tamanho da que não importa.
 */
type Vez = "voce" | "cliente" | "confirmou" | "recusada"

function vezDe(s: SolicitacaoAdmin): Vez {
  if (s.status === "recusada") return "recusada"
  if (s.status === "pendente") return "voce"
  return s.clienteConfirmouAt ? "confirmou" : "cliente"
}

const SELO: Record<Vez, { texto: string; classe: string }> = {
  voce: {
    texto: "sua vez",
    classe:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  },
  confirmou: {
    texto: "✋ cliente confirmou",
    classe:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  cliente: {
    texto: "com o cliente",
    classe: "bg-muted text-muted-foreground",
  },
  recusada: {
    texto: "recusada",
    classe: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  },
}

function Selo({ vez }: { vez: Vez }) {
  const s = SELO[vez]
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.classe}`}
    >
      {s.texto}
    </span>
  )
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

/**
 * Junta as lojas que ficaram de fora pelo MESMO motivo.
 *
 * O motivo vem pronto do servidor e traz o CNPJ dentro da frase, então doze
 * lojas com o mesmo problema geram doze textos diferentes por um detalhe que
 * não muda o diagnóstico. Normalizar o CNPJ pra agrupar é o que transforma
 * doze parágrafos numa explicação e uma lista de nomes.
 *
 * O CNPJ não se perde: ele está no nome da loja na tabela logo abaixo, que é
 * onde a pessoa vai agir.
 */
function agruparPorMotivo(
  pendentes: { name: string; motivo: string }[],
): { chave: string; motivo: string; lojas: string[] }[] {
  const mapa = new Map<string, { motivo: string; lojas: string[] }>()
  for (const p of pendentes) {
    // Tira números longos (CNPJ com ou sem máscara) pra achar o texto comum.
    const chave = p.motivo.replace(/[\d./-]{11,}/g, "#")
    const atual = mapa.get(chave)
    if (atual) atual.lojas.push(p.name)
    else mapa.set(chave, { motivo: p.motivo.replace(/[\d./-]{11,}/g, "").replace(/\s{2,}/g, " ").trim(), lojas: [p.name] })
  }
  return [...mapa.entries()].map(([chave, v]) => ({ chave, ...v }))
}

/** Uma linha da fila com as transições de status possíveis. */
function Linha({
  s,
  lojasDaRede,
}: {
  s: SolicitacaoAdmin
  lojasDaRede: LojaDaRede[]
}) {
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    atualizarSolicitacaoIfood,
    { ok: false },
  )

  // Recusada não tem "próximo status", mas precisa do Desfazer — senão o
  // bloco de ações inteiro some e o clique errado fica sem volta.
  const podeDesfazer = Boolean(s.statusAnterior) || s.status === "recusada"

  // "Loja vinculada — ativar" saiu daqui de propósito. Era do tempo em que o
  // vínculo era manual; hoje quem conecta é o cron de 15 min (ou o botão do
  // topo), e manter o botão fazia parecer que faltava uma ação do operador —
  // que ao clicar só recebia "esta loja ainda não apareceu no nosso app".
  // Em "solicitada" a bola está com o CLIENTE: a única saída manual é recusar.
  /**
   * O passo seguinte da fila. NUNCA fica escondido.
   *
   * O rótulo diz o efeito, não o nome do estado: é este botão que manda o
   * e-mail pedindo pro cliente aprovar no Portal do Parceiro dele. "Marquei
   * como solicitada" descrevia o campo no banco e deixava a pergunta óbvia sem
   * resposta — "e como eu aviso o cliente?".
   */
  const proximas: Array<{ status: string; rotulo: string }> =
    s.status === "pendente"
      ? [{ status: "solicitada", rotulo: "Avisar cliente pra aprovar" }]
      : []

  /** Recusar é uma ação à parte: ela pede o aviso que o cliente vai ler. */
  const podeRecusar = s.status === "pendente" || s.status === "solicitada"
  /** Só faz sentido riscar da lista o que ainda depende de você lançar. */
  const podeMarcarLancado = podeRecusar
  const jaRecusada = s.status === "recusada"

  // Fecha o campo assim que a gravação passa: depois de salvar, o aviso vira
  // texto de novo. Deixar a caixa aberta dava a impressão de que não salvou.
  const [editando, setEditando] = React.useState(false)

  /**
   * As ações ficam GUARDADAS até serem pedidas — menos nas recusadas, onde
   * agir é o ponto da linha.
   *
   * Recusar, "já está na rede" e desfazer são exceções: o caminho normal da
   * fila é copiar o CNPJ, lançar no portal e esperar o cliente aprovar. Só que
   * elas ocupavam quase metade da altura de CADA linha. Com 100 lojas, isso é
   * uma tela inteira de botões que quase nunca são clicados, empurrando pra
   * baixo justamente o que se quer ler: qual loja, de quem, em que status.
   */
  const [acoesAbertas, setAcoesAbertas] = React.useState(false)
  /**
   * ⚠️ SÓ AS EXCEÇÕES SE ESCONDEM. O passo seguinte (`proximas`) fica sempre
   * visível — escondê-lo foi um erro que travou a fila na prática: o botão
   * "lancei" risca o CNPJ da sua lista mas NÃO muda o status nem avisa o
   * cliente, então a loja continuava em "sua vez" sem nenhum caminho aparente
   * pra sair dali.
   */
  const mostrarAcoes = acoesAbertas || jaRecusada || editando
  React.useEffect(() => {
    if (state.ok) setEditando(false)
  }, [state.ok])

  return (
    <div
      className={`rounded-lg border p-3 ${s.lancadoNoPortal ? "border-dashed bg-muted/10 opacity-70" : "bg-muted/20"}`}
    >
      {/* A LOJA é o assunto da linha, então ela vem primeiro e em negrito.
          Antes o CNPJ ocupava esse lugar: número de 18 dígitos como âncora
          visual de 100 linhas, com o nome da loja em cinza atrás. Ninguém
          procura uma loja pelo CNPJ — procura pelo nome e usa o CNPJ pra
          colar no portal. A ordem agora reflete isso. */}
      <div className="flex items-start gap-2 text-xs">
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[13px] font-semibold leading-tight ${
              s.lancadoNoPortal ? "text-muted-foreground" : ""
            }`}
          >
            {s.unitLabel ?? "(loja sem nome)"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`font-mono text-[11px] tabular-nums ${
                s.lancadoNoPortal
                  ? "text-muted-foreground line-through"
                  : "text-muted-foreground"
              }`}
            >
              {fmtCnpj(s.cnpj)}
            </span>
            <CopiarCnpj cnpj={s.cnpj} />
            {podeMarcarLancado && (
              <BotaoLancado id={s.id} lancado={s.lancadoNoPortal} />
            )}
          </div>
        </div>
        <Selo vez={vezDe(s)} />
        {/* Fica FORA das ações escondidas: pausa é um estado da linha, não uma
            ação. Guardada atrás do "⋯", a fila mostraria "com o cliente" numa
            loja que nunca vai cobrar nem recusar, e ninguém saberia por quê. */}
        {s.pausadaMotivo && (
          <span
            title={`Régua pausada: ${s.pausadaMotivo}`}
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
          >
            não expira
          </span>
        )}
        {!mostrarAcoes && (
          <button
            type="button"
            onClick={() => setAcoesAbertas(true)}
            title="Recusar, marcar que já está na rede, desfazer"
            className="shrink-0 rounded px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ⋯
          </button>
        )}
      </div>

      {/* O aviso salvo, em texto — é literalmente o que o cliente lê. */}
      {jaRecusada && !editando && (
        <p className="mt-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {s.nota ?? "Sem aviso escrito — o cliente vê só o texto padrão."}
        </p>
      )}

      {/* O passo seguinte, sempre visível e destacado. */}
      {proximas.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {proximas.map((p) => (
            <form key={p.status} action={action}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value={p.status} />
              <BotaoStatus rotulo={p.rotulo} />
            </form>
          ))}
          <span className="text-[11px] text-muted-foreground">
            manda o e-mail pedindo que ele aprove no Portal do Parceiro
          </span>
        </div>
      )}

      {mostrarAcoes && (podeRecusar || jaRecusada || podeDesfazer) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">

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

          {podeRecusar && (
            <BotaoPausar id={s.id} motivo={s.pausadaMotivo} />
          )}

          {podeRecusar && lojasDaRede.length > 0 && (
            <CompartilharLoja
              solicitacaoId={s.id}
              holdingId={s.holdingId ?? null}
              lojas={lojasDaRede}
            />
          )}
          {/* Recusada sempre pode voltar; sem histórico, volta pro início. */}
          {podeDesfazer && (
            <BotaoDesfazer id={s.id} para={s.statusAnterior ?? "pendente"} />
          )}
          {/* RESOLVER: tira da fila sem apagar. Antes, uma recusa só saía daqui
              por "Desfazer" — que REABRE o pedido, o oposto do que se quer
              quando o assunto acabou (loja que não usa iFood, CNPJ trocado,
              duplicata). Sem isso a fila acumula pra sempre, e fila que
              ninguém confia é fila que ninguém olha. */}
          {jaRecusada && (
            <form action={action}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value="arquivada" />
              <input type="hidden" name="nota" value={s.nota ?? ""} />
              <BotaoStatus rotulo="Resolver" />
            </form>
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
 * Liga e desliga a régua automática desta loja (cobrança em 1 dia, recusa
 * em 3).
 *
 * O motivo é digitado na hora e obrigatório — é o que aparece no selo "não
 * expira" da linha e no relatório do cron. Sem ele, daqui a três semanas a
 * fila tem lojas paradas e ninguém lembra se ainda faz sentido esperar.
 */
function BotaoPausar({ id, motivo }: { id: string; motivo: string | null }) {
  const [abrindo, setAbrindo] = React.useState(false)
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    pausarAutomacaoSolicitacao,
    { ok: false },
  )
  React.useEffect(() => {
    if (state.ok) setAbrindo(false)
  }, [state.ok])

  // Já pausada: um clique volta ao normal. Não pede confirmação — despausar é
  // o estado padrão do sistema, e o erro aqui se corrige pausando de novo.
  if (motivo) {
    return (
      <form action={action} className="inline-flex items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="pausar" value="0" />
        <Button type="submit" size="sm" variant="outline" className="h-7 text-[11px]">
          Voltar a expirar
        </Button>
        <span className="text-[11px] text-muted-foreground">
          pausada: {motivo}
        </span>
      </form>
    )
  }

  if (!abrindo)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        onClick={() => setAbrindo(true)}
        title="Não cobrar confirmação nem recusar sozinha — pra quando a bola está com o iFood, não com o cliente"
      >
        Não expirar
      </Button>
    )

  return (
    <form action={action} className="flex flex-1 basis-full items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="pausar" value="1" />
      <input
        type="text"
        name="motivo"
        autoFocus
        defaultValue="iFood não está liberando lojas novas — chamado aberto"
        placeholder="Por que não deve expirar (só você lê)"
        className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1 text-[11px]"
      />
      <BotaoStatus rotulo="Pausar régua" />
      <button
        type="button"
        onClick={() => setAbrindo(false)}
        className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        cancelar
      </button>
    </form>
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
            {state.pendentes!.length} ficaram de fora — resolva na tabela abaixo:
          </p>
          {/* AGRUPADO PELO MOTIVO. Cada loja vinha com o parágrafo inteiro de
              explicação repetido: doze lojas com o mesmo problema produziam
              doze parágrafos idênticos a menos do CNPJ, e o bloco virava um
              muro de texto laranja onde não dava pra ver QUAIS lojas são.
              Agora a explicação aparece uma vez e as lojas viram uma lista. */}
          <div className="mt-1.5 flex flex-col gap-2">
            {agruparPorMotivo(state.pendentes!).map((g) => (
              <div key={g.chave}>
                <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  {g.motivo}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                  {g.lojas.join(" · ")}
                </p>
              </div>
            ))}
          </div>
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

export type LojaDaRede = {
  id: string
  code: string
  name: string
  holdingId: string
  holdingName: string
}

export function SolicitacoesPanel({
  solicitacoes,
  lojasDaRede = [],
  busca = "",
}: {
  solicitacoes: SolicitacaoAdmin[]
  /** Todas as lojas da plataforma — pro caso "essa loja já está na rede". */
  lojasDaRede?: LojaDaRede[]
  /**
   * Busca da tela, já normalizada. Precisa chegar aqui: a fila e a tabela de
   * merchants são listas diferentes da MESMA pergunta ("cadê a loja X"), e uma
   * busca que filtra só metade da tela responde errado sem avisar.
   */
  busca?: string
}) {
  // Loja já ativa = jornada concluída → sai da fila (continua visível como
  // "Vinculado" na tabela de merchants abaixo). A fila mostra só o que ainda
  // precisa de ação: pendente, solicitada e recusada.
  const naFila = solicitacoes
    .filter((s) => s.status !== "ativa")
    .filter((s) => combina(busca, s.unitLabel, s.cnpj, s.holdingName))
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
      <Grupo titulo="Aguardando" itens={abertas} lojasDaRede={lojasDaRede} busca={busca} />
      <Grupo titulo="Recusadas" itens={recusadas} lojasDaRede={lojasDaRede} busca={busca} />
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
  lojasDaRede,
  busca,
}: {
  titulo: string
  itens: SolicitacaoAdmin[]
  lojasDaRede: LojaDaRede[]
  busca: string
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
            // Resumo por cliente: responde "esse cliente precisa de mim?"
            // sem ler linha por linha. Com 100 lojas na fila, é a diferença
            // entre varrer a tela e bater o olho.
            const conta = (v: Vez) =>
              doCliente.filter((x) => vezDe(x) === v).length
            const resumo = [
              conta("voce") > 0 && `${conta("voce")} sua vez`,
              conta("confirmou") > 0 && `${conta("confirmou")} confirmada${conta("confirmou") > 1 ? "s" : ""}`,
              conta("cliente") > 0 && `${conta("cliente")} com o cliente`,
              conta("recusada") > 0 && `${conta("recusada")} recusada${conta("recusada") > 1 ? "s" : ""}`,
            ].filter(Boolean) as string[]
            const precisaDeVoce = conta("voce") + conta("confirmou")

            return (
              // Nasce FECHADO. Com 10 clientes e 500 lojas, abrir tudo é uma
              // rolagem que não termina — e o cabeçalho já diz o que há dentro
              // ("3 lojas · 3 com o cliente" + o selo "N pra você"), que é o
              // suficiente pra decidir se vale abrir.
              //
              // Buscando, abre: quem digitou um nome quer VER o resultado, não
              // um bloco fechado com a contagem certa.
              <details
                key={cliente}
                open={Boolean(busca)}
                className="group/cliente rounded-lg border bg-background"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/cliente:rotate-90" />
                  {/* Nome do cliente é a âncora: é por ele que o trabalho é
                      organizado (um Portal do Desenvolvedor por vez). */}
                  <h3 className="text-[15px] font-bold tracking-tight">
                    {cliente}
                  </h3>
                  {precisaDeVoce > 0 && (
                    <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      {precisaDeVoce} pra você
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {doCliente.length} loja{doCliente.length > 1 ? "s" : ""}
                    {resumo.length > 0 && ` · ${resumo.join(" · ")}`}
                    {aLancar.length > 0 && ` · ${aLancar.length} a lançar`}
                  </span>
                  {aguardando && (
                    <span className="ml-auto">
                      <CopiarLote cnpjs={aLancar} />
                    </span>
                  )}
                </summary>
                <div className="p-3">
                {/* A explicação vive AQUI, uma vez por cliente. */}
                {aguardando &&
                  doCliente.some((s) => s.status === "solicitada") && (
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      As marcadas como <b>solicitada</b> dependem do
                      Proprietário aprovar no Portal do Parceiro dele — a
                      conexão se fecha sozinha (checamos a cada 15 min).
                    </p>
                  )}
                <div className="space-y-2">
                  {doCliente.map((s) => (
                    <Linha key={s.id} s={s} lojasDaRede={lojasDaRede} />
                  ))}
                </div>
                </div>
              </details>
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

/**
 * "Essa loja já está na rede" — o terceiro caminho da fila.
 *
 * Fica escondido atrás de um clique porque é o caso RARO: a fila normal é
 * aprovar ou recusar. Aberto o tempo todo, um seletor com todas as lojas da
 * plataforma em cada linha viraria ruído — e um seletor grande e fácil de
 * clicar por engano numa ação que dá acesso de uma empresa a outra é
 * exatamente o que não se quer.
 *
 * Lista só lojas de OUTRAS empresas: compartilhar com a dona não existe.
 */
function CompartilharLoja({
  solicitacaoId,
  holdingId,
  lojas,
}: {
  solicitacaoId: string
  holdingId: string | null
  lojas: LojaDaRede[]
}) {
  const [aberto, setAberto] = React.useState(false)
  const [unitId, setUnitId] = React.useState("")
  const [msg, setMsg] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [pendente, startTransition] = React.useTransition()

  const opcoes = React.useMemo(
    () =>
      lojas
        .filter((l) => l.holdingId !== holdingId)
        .sort(
          (a, b) =>
            a.holdingName.localeCompare(b.holdingName, "pt-BR") ||
            a.code.localeCompare(b.code, "pt-BR"),
        ),
    [lojas, holdingId],
  )

  if (!aberto)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        onClick={() => setAberto(true)}
        title="Quando o CNPJ pedido já é uma loja conectada em outra conta"
      >
        Já está na rede
      </Button>
    )

  return (
    <div className="flex flex-1 basis-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-[11px]"
        >
          <option value="">Qual loja já conectada é esta?</option>
          {opcoes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.holdingName} · #{l.code} {l.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px]"
          disabled={!unitId || pendente}
          onClick={() => {
            setErro(null)
            setMsg(null)
            startTransition(async () => {
              const r = await compartilharLojaExistente(solicitacaoId, unitId)
              if (r.ok) {
                setMsg(r.message ?? "Compartilhada.")
                setAberto(false)
              } else setErro(r.error ?? "Não deu.")
            })
          }}
        >
          {pendente ? "Compartilhando…" : "Compartilhar (leitura)"}
        </Button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          cancelar
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        O cliente passa a VER essa loja, sem poder editar nada nela. A
        solicitação é arquivada (não recusada) e nenhum e-mail é enviado —
        avise por mensagem.
      </p>
      {erro && <p className="text-[10px] text-rose-600">{erro}</p>}
      {msg && <p className="text-[10px] text-emerald-700">{msg}</p>}
    </div>
  )
}
