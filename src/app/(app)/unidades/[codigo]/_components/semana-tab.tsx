"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CalendarCheck, CircleAlert, Clock, TrendingDown, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"
import type {
  ItemDaSemana,
  PlataformaNaSemana,
  SemanaDaLoja,
} from "@/lib/data/relatorio-semanal"

import { salvarSemana, type SalvarSemanaState } from "../_actions-semanal"

const dia = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

const SITUACAO = {
  entregue: {
    txt: "Entregue",
    Icone: CalendarCheck,
    tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  pendente: {
    txt: "Pendente",
    Icone: Clock,
    tom: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  vencida: {
    txt: "Vencida",
    Icone: CircleAlert,
    tom: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
} as const

/**
 * Ciclo semanal da loja — o número vem pronto, o texto é do gestor.
 *
 * O painel que a agência usa hoje pede "Informe o faturamento da semana" num
 * campo vazio, e alguém abre o portal da plataforma pra preencher. Aqui o
 * número já está na tela; o que se digita é a leitura dele, que é o produto
 * que a agência vende.
 */
export function SemanaTab({
  unitId,
  codigo,
  semanas,
}: {
  unitId: string
  codigo: string
  semanas: SemanaDaLoja[]
}) {
  if (semanas.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Sem semanas fechadas ainda.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Semana de segunda a domingo, entrega na quarta seguinte. O faturamento é
        calculado do que já entrou — não precisa digitar.
      </p>
      <Serie semanas={semanas} />
      {semanas.map((s) => (
        <Semana key={s.inicio} unitId={unitId} codigo={codigo} s={s} />
      ))}
    </div>
  )
}

function Semana({
  unitId,
  codigo,
  s,
}: {
  unitId: string
  codigo: string
  s: SemanaDaLoja
}) {
  const [estado, acao] = useActionState<SalvarSemanaState, FormData>(
    salvarSemana,
    { ok: false },
  )
  const [texto, setTexto] = React.useState(s.texto ?? "")
  const sit = SITUACAO[s.situacao]
  const Icone = sit.Icone
  const subiu = (s.variacaoPct ?? 0) >= 0
  const Seta = subiu ? TrendingUp : TrendingDown

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <span className="text-sm font-semibold">
          {dia(s.inicio)} a {dia(s.fim)}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sit.tom}`}
        >
          <Icone className="size-3" />
          {sit.txt}
        </span>
        <span className="text-[11px] text-muted-foreground">
          vence {dia(s.vencimento)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Numero rotulo="Faturamento" valor={s.bruto === null ? null : fmtBRL(s.bruto)} destaque />
        <Numero rotulo="Pedidos" valor={s.pedidos === null ? null : fmtNum(s.pedidos)} />
        <Numero
          rotulo="Ticket médio"
          valor={s.ticketMedio === null ? null : fmtBRL(s.ticketMedio)}
        />
        <div className="bg-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            vs. semana anterior
          </p>
          {s.variacaoPct === null ? (
            <p className="mt-0.5 text-sm text-muted-foreground">—</p>
          ) : (
            <p
              className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold ${
                subiu
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <Seta className="size-3.5" />
              {subiu ? "+" : ""}
              {s.variacaoPct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <PorPlataforma lista={s.plataformas} />
      <Itens semana={s} />

      <form action={acao} className="flex flex-col gap-2 border-t px-4 py-3">
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="codigo" value={codigo} />
        <input type="hidden" name="semana" value={s.inicio} />
        {/* "Comentários", não "Relatório da semana". (Marcus, 28/08/26)
            O RELATÓRIO É TUDO QUE ESTÁ ACIMA — os números, as plataformas, o
            gráfico, os produtos. Esta caixa é o que o gestor escreve EM CIMA
            disso. Chamá-la de relatório prometia que ela é o relatório, e era
            por isso que "Salvar relatório" parecia que deveria fazer algo
            além de salvar. O nome errado criava a expectativa errada. */}
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Comentários da semana
        </label>
        <textarea
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="O que explica o número, o que foi feito, o que vem pela frente."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Salvar />
          {estado.error && (
            <span className="text-xs text-rose-600">{estado.error}</span>
          )}
          {estado.ok && estado.message && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {estado.message}
            </span>
          )}
          {s.entregueEm && !estado.ok && (
            /* "comentado em", não "entregue em": o sistema não envia nada
               ainda, e dizer que foi entregue afirma o que não aconteceu. O
               selo da semana continua "Entregue" porque ele mede o CICLO da
               agência — o gestor fez a parte dele. Quando existir envio, as
               duas palavras voltam a significar a mesma coisa. */
            <span className="text-[11px] text-muted-foreground">
              comentado em{" "}
              {new Date(s.entregueEm).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * `null` vira "sem dado importado", nunca R$ 0,00.
 *
 * Zero é uma afirmação — diz que a loja não vendeu. Numa semana sem
 * importação isso vira um relatório mandado pro cliente da agência afirmando
 * faturamento zero. O travessão custa uma pergunta; o zero custa credibilidade.
 */
function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string | null
  destaque?: boolean
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      {valor === null ? (
        <p className="mt-0.5 text-sm text-muted-foreground" title="Nenhum dado importado nesta semana">
          — sem dado
        </p>
      ) : (
        <p className={`mt-0.5 tabular-nums ${destaque ? "text-lg font-semibold" : "text-sm font-medium"}`}>
          {valor}
        </p>
      )}
    </div>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-8 text-xs" disabled={pending}>
      {pending ? "Salvando…" : "Salvar comentário"}
    </Button>
  )
}

/**
 * A série das semanas em barras.
 *
 * Existe porque a lista responde "quanto foi cada semana" e não responde
 * "para onde isso está indo" — que é a primeira coisa que o gestor precisa
 * dizer no relatório. Sete números empilhados não viram tendência na cabeça
 * de ninguém; sete barras viram na hora.
 *
 * Ordem cronológica aqui, ao contrário da lista abaixo: gráfico que cresce
 * pra esquerda se lê errado, mesmo com o eixo escrito.
 */
function Serie({ semanas }: { semanas: SemanaDaLoja[] }) {
  const dados = [...semanas].reverse().filter((s) => s.bruto !== null)
  if (dados.length < 2) return null
  const max = Math.max(...dados.map((s) => s.bruto ?? 0))
  const ultima = dados[dados.length - 1]

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Faturamento por semana
        </p>
        <p className="text-[11px] text-muted-foreground">
          {dados.length} semanas · maior {fmtBRLShort(max)}
        </p>
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5">
        {dados.map((s) => {
          const alt = max > 0 ? Math.max(4, ((s.bruto ?? 0) / max) * 100) : 4
          const eh = s === ultima
          return (
            /* ⚠️ A COLUNA PRECISA DE `h-full`, e a barra de um pai com altura
               resolvida. Sem isso a altura em % da barra é calculada contra um
               pai `auto` e vira ZERO — o gráfico renderiza os rótulos e nenhuma
               barra, que foi exatamente o que apareceu no primeiro teste. */
            <div
              key={s.inicio}
              className="group flex h-full flex-1 flex-col items-center gap-1"
              title={`${dia(s.inicio)} a ${dia(s.fim)} · ${fmtBRL(s.bruto ?? 0)}${
                s.variacaoPct === null
                  ? ""
                  : ` · ${s.variacaoPct >= 0 ? "+" : ""}${s.variacaoPct.toFixed(1)}% vs. semana anterior`
              }`}
            >
              {/* A variação fica SEMPRE visível, não só no hover: a pergunta
                  do gráfico é "subiu ou caiu", e resposta que exige passar o
                  mouse não é resposta pra quem está lendo de relance.
     
                  ⚠️ COM UMA CASA DECIMAL, igual ao cartão. Arredondado pra
                  inteiro, o gráfico dizia "8%" onde o cartão dizia "7,8%" —
                  os dois certos, e mesmo assim o leitor para pra conferir se
                  bateu. E parar pra conferir é caro aqui, porque o gráfico
                  corre da esquerda pra direita e a lista embaixo corre do
                  mais recente pro mais antigo: quem cruza os dois erra de
                  semana com facilidade. O número idêntico nos dois lugares
                  resolve sem precisar inverter nenhuma das ordens. */}
              <span className="h-3 text-[9px] font-semibold tabular-nums">
                {s.variacaoPct === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={
                      s.variacaoPct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    {s.variacaoPct >= 0 ? "▲" : "▼"}
                    {Math.abs(s.variacaoPct).toFixed(1)}%
                  </span>
                )}
              </span>
              <div className="flex w-full flex-1 items-end">
                {/* Cor pela DIREÇÃO, não pela posição: barra que caiu fica
                    vermelha mesmo sendo a última. O que interessa é o sinal. */}
                <div
                  className={`w-full rounded-t transition-colors ${
                    s.variacaoPct !== null && s.variacaoPct < 0
                      ? eh
                        ? "bg-rose-500"
                        : "bg-rose-400/45 group-hover:bg-rose-400/65"
                      : eh
                        ? "bg-primary"
                        : "bg-primary/30 group-hover:bg-primary/50"
                  }`}
                  style={{ height: `${alt}%` }}
                />
              </div>
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {dia(s.inicio).slice(0, 5)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A semana aberta por plataforma.
 *
 * A barra de proporção mostra o PESO de cada canal — dizer "iFood R$ 26 mil"
 * não responde "quanto do meu faturamento depende do iFood", que é a pergunta
 * que muda decisão.
 */
function PorPlataforma({ lista }: { lista: PlataformaNaSemana[] }) {
  if (lista.length === 0) return null
  const total = lista.reduce((s, p) => s + p.bruto, 0)

  return (
    <div className="border-t">
      {total > 0 && (
        <div className="flex h-1.5 w-full overflow-hidden">
          {lista.map((p) => (
            <div
              key={p.id}
              className="h-full"
              style={{
                width: `${(p.bruto / total) * 100}%`,
                background: COR[p.id],
              }}
            />
          ))}
        </div>
      )}
      <div className="divide-y">
        {lista.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs"
          >
            <span className="flex min-w-[104px] items-center gap-1.5">
              <PlatformLogo platform={p.id} size="sm" />
              <span className="font-medium">{ROTULO[p.id]}</span>
            </span>
            <span className="tabular-nums font-semibold">{fmtBRL(p.bruto)}</span>
            <span className="tabular-nums text-muted-foreground">
              {fmtNum(p.pedidos)} ped
            </span>
            <span className="tabular-nums text-muted-foreground">
              {fmtBRL(p.ticketMedio)} ticket
            </span>
            {p.nota === null ? (
              <span
                className="text-muted-foreground"
                title="Ninguém avaliou nesta semana, ou a plataforma não nos entrega a nota"
              >
                — sem nota
              </span>
            ) : (
              <span className="tabular-nums font-medium">
                ★ {p.nota.toFixed(2)}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({p.notasQtd})
                </span>
              </span>
            )}
            {total > 0 && (
              <span className="ml-auto tabular-nums text-[11px] text-muted-foreground">
                {((p.bruto / total) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* Cor de marca de cada plataforma — as mesmas do PlatformLogo, pra a barra
 * de proporção e o logo ao lado falarem a mesma língua. A 99 e a Keeta são
 * amarelos parecidos de propósito: é a marca delas, não escolha nossa. */
const COR: Record<PlataformaNaSemana["id"], string> = {
  ifood: "#EA1D2C",
  "99food": "#FFD300",
  keeta: "#FFCD00",
  cardapioweb: "#5B2A86",
}

const ROTULO: Record<PlataformaNaSemana["id"], string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/* Fatias da rosca. Cinco tons do laranja da marca, do mais forte ao mais
   fraco, e o cinza pro "outros" — que não é um produto e não deve competir
   por atenção com quem é. */
const FATIAS = ["#EA5B0C", "#F07B36", "#F59B63", "#F9B98F", "#FCD6BC"]
const OUTROS = "#D4D4D8"

/**
 * Mais e menos vendidos da semana.
 *
 * ── POR QUE OS MAIS VENDIDOS SÃO PIZZA E OS MENOS SÃO LISTA ──────────────
 * A rosca responde "de onde vem o meu volume" — cinco fatias grandes e o
 * resto. Já os menos vendidos ocupam 0,3% cada: em pizza virariam riscos
 * invisíveis, e o gráfico diria "não há nada aqui" quando a informação é
 * justamente quais itens não giram. Lista com o número resolve.
 *
 * ⚠️ RANQUEADO POR UNIDADE, não por receita: a Keeta manda item sem valor, e
 * ordenar por dinheiro a zeraria.
 */
function Itens({ semana }: { semana: SemanaDaLoja }) {
  if (semana.topItens.length === 0) return null

  const top = semana.topItens
  const somaTop = top.reduce((a, i) => a + i.qtd, 0)
  const restoQtd = Math.max(0, semana.totalUnidades - somaTop)
  const restoPct =
    semana.totalUnidades > 0 ? (restoQtd / semana.totalUnidades) * 100 : 0

  // Fatias em graus, na ordem: top 5 e depois "outros".
  const fatias = [
    ...top.map((i, n) => ({ pct: i.pct, cor: FATIAS[n] })),
    ...(restoQtd > 0 ? [{ pct: restoPct, cor: OUTROS }] : []),
  ]
  let acc = 0
  const stops = fatias
    .map((f) => {
      const ini = acc
      acc += f.pct
      return `${f.cor} ${ini.toFixed(2)}% ${acc.toFixed(2)}%`
    })
    .join(", ")

  const plats = [...new Set(top.flatMap((i) => i.plataformas))].sort()

  return (
    <div className="flex flex-col gap-4 border-t px-4 py-4 lg:flex-row">
      <div className="flex items-center gap-4">
        <div
          className="size-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${stops})`,
            // O furo transforma a pizza em rosca: o miolo carrega o total, e
            // um número no centro é mais legível que uma legenda ao lado.
            mask: "radial-gradient(circle, transparent 52%, black 53%)",
            WebkitMask: "radial-gradient(circle, transparent 52%, black 53%)",
          }}
          role="img"
          aria-label={`Cinco itens mais vendidos representam ${somaTop} de ${semana.totalUnidades} unidades`}
        />
        <div className="lg:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mais vendidos
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {fmtNum(semana.totalUnidades)} un.
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          5 mais vendidos · {fmtNum(semana.totalUnidades)} unidades na semana
        </p>
        <ul className="flex flex-col gap-1">
          {top.map((i, n) => (
            <LinhaItem key={i.nome} item={i} cor={FATIAS[n]} />
          ))}
          {restoQtd > 0 && (
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: OUTROS }}
              />
              <span className="min-w-0 flex-1 truncate">
                outros {semana.itensDistintos - top.length} itens
              </span>
              <span className="tabular-nums">{fmtNum(restoQtd)}</span>
              <span className="w-10 text-right tabular-nums">
                {restoPct.toFixed(0)}%
              </span>
            </li>
          )}
        </ul>

        {semana.piorItens.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              5 que menos giraram
            </p>
            <ul className="flex flex-col gap-1">
              {semana.piorItens.map((i) => (
                <LinhaItem key={i.nome} item={i} />
              ))}
            </ul>
          </>
        )}

        {/* Quais plataformas entraram na conta. Sem isso o ranking parece
            cobrir a loja inteira — e o iFood só tem item diário até 11/08. */}
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Contando {plats.map((p) => ROTULO[p]).join(", ")}. O mesmo prato pode
          aparecer duas vezes: cada plataforma tem o próprio nome pra ele.
        </p>
      </div>
    </div>
  )
}

function LinhaItem({ item, cor }: { item: ItemDaSemana; cor?: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className="size-2.5 shrink-0 rounded-sm"
        style={{ background: cor ?? "transparent", border: cor ? undefined : "1px solid var(--border)" }}
      />
      <span className="min-w-0 flex-1 truncate" title={item.nome}>
        {item.nome}
      </span>
      <span className="flex shrink-0 gap-0.5">
        {item.plataformas.map((p) => (
          <PlatformLogo key={p} platform={p} size="sm" />
        ))}
      </span>
      <span className="w-10 text-right tabular-nums text-muted-foreground">
        {fmtNum(item.qtd)}
      </span>
      <span className="w-10 text-right font-medium tabular-nums">
        {item.pct.toFixed(1)}%
      </span>
    </li>
  )
}
