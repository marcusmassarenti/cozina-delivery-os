"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import {
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Building2,
  Copy,
  Check,
  ChevronRight,
  MapPin,
} from "lucide-react"

import { ignorarMerchant, type IgnorarMerchantState } from "../_actions"
import { combina, type Aba } from "./abas"
import { AppToggles } from "./app-toggles"
import { LinkRow } from "./link-row"

type MerchantRow = {
  id: string
  name: string | null
  corporate_name: string | null
  cnpj: string | null
  city: string | null
  state: string | null
  merchant_state: string | null
  ignorado_em: string | null
  ignorado_motivo: string | null
}
type UnitOption = {
  id: string
  code: string
  name: string
  holdingId: string
  holdingName: string
  /** Cliente suspenso (trial vencido / cobrança). Ver a nota no agrupamento. */
  suspenso?: boolean
}
type Linked = {
  unitId: string
  code: string
  name: string
  /** "OK do admin" por app — cada um é autorizado à parte no portal iFood. */
  finOn: boolean
  reviewOn: boolean
  holdingName: string
  unidadeInativa: boolean
}

// Chaves-sentinela dos grupos. O prefixo fora da faixa de nomes normais
// garante que nenhuma holding chamada "Ignoradas" colida com o balde.
const IGNORADAS = "\uffff-ignoradas"
const SEM_VINCULO = "\u0000sem-vinculo"

function fmtCnpj(d: string | null): string | null {
  const s = (d ?? "").replace(/\D/g, "")
  if (s.length !== 14) return d
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
}

/** Status da loja no iFood, em português. */
function rotuloStatus(s: string | null): { txt: string; tom: string } | null {
  if (!s) return null
  const up = s.toUpperCase()
  if (up === "AVAILABLE")
    return { txt: "Aberta no iFood", tom: "text-emerald-700 dark:text-emerald-400" }
  if (up === "UNAVAILABLE")
    return { txt: "Fechada agora", tom: "text-muted-foreground" }
  if (up === "DISABLED")
    return { txt: "Desativada no iFood", tom: "text-rose-600 dark:text-rose-400" }
  return { txt: s, tom: "text-muted-foreground" }
}

/** Copia um valor técnico (id/CNPJ) sem ocupar coluna na tabela. */
function Copiavel({ valor, label }: { valor: string; label: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(valor)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1200)
      }}
      title={`${label}: ${valor} (clique pra copiar)`}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted"
    >
      {copiado ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
      {label}
    </button>
  )
}

/** Arquiva/desarquiva um merchant que não vai virar unidade da rede. */
function BotaoIgnorar({
  merchantId,
  ignorado,
}: {
  merchantId: string
  ignorado: boolean
}) {
  const [state, action] = useActionState<IgnorarMerchantState, FormData>(
    ignorarMerchant,
    { ok: false },
  )
  return (
    <form action={action} className="inline">
      <input type="hidden" name="merchantId" value={merchantId} />
      {ignorado && <input type="hidden" name="desfazer" value="1" />}
      <SubmitIgnorar ignorado={ignorado} />
      {state.error && (
        <span className="ml-1 text-[10px] text-rose-600">{state.error}</span>
      )}
    </form>
  )
}

function SubmitIgnorar({ ignorado }: { ignorado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title={
        ignorado
          ? "Trazer de volta pra lista"
          : "Arquivar: sai das pendências e não volta no re-puxar"
      }
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      {ignorado ? (
        <ArchiveRestore className="size-2.5" />
      ) : (
        <Archive className="size-2.5" />
      )}
      {pending ? "..." : ignorado ? "Restaurar" : "Ignorar"}
    </button>
  )
}

/**
 * Lojas do iFood agrupadas POR CLIENTE.
 *
 * Antes era uma lista alfabética única com 30 linhas de clientes diferentes
 * misturados, e quatro colunas técnicas (CNPJ, Merchant ID) das quais duas
 * viviam vazias — não dava pra bater o olho e saber de quem era o quê.
 *
 * Agora: quem AINDA NÃO tem unidade vem num bloco de alerta no topo (é o
 * que exige ação), e o resto vira uma seção por cliente. O merchant só
 * "sabe" de que cliente é depois de vinculado — a Merchant API não devolve
 * CNPJ, então é o vínculo com a unidade que dá essa informação.
 *
 * Os campos técnicos viraram botões de copiar: continuam à mão pra conferir
 * no Portal do Desenvolvedor, sem competir com o que se lê todo dia.
 */
export function MerchantsTable({
  merchants,
  units,
  holdings,
  donoPorCnpj,
  byMerchant,
  compartilhadas = {},
  aba,
  busca,
}: {
  merchants: MerchantRow[]
  units: UnitOption[]
  holdings: { id: string; name: string }[]
  /** CNPJ → cliente que pediu a conexão. Sugere o dono do merchant. */
  donoPorCnpj?: Record<string, { id: string; name: string }>
  byMerchant: Record<string, Linked>
  /**
   * Lojas que o cliente ACOMPANHA (de outra empresa), por nome do cliente.
   *
   * Entra aqui porque a tabela agrupa por MERCHANT vinculado, e cliente que só
   * acompanha não tem merchant nenhum — ele simplesmente não existia na tela.
   * Quem lê esta página pergunta "quantas lojas esse cliente tem no sistema?",
   * e a resposta é conectadas + acompanhadas.
   */
  compartilhadas?: Record<
    string,
    { code: string; name: string; donaNome: string }[]
  >
  /** Qual das três perguntas da tela está sendo respondida agora. */
  aba: Aba
  /** Busca já normalizada (minúscula, sem acento nem pontuação). */
  busca: string
}) {
  const [cliente, setCliente] = React.useState<string>("todos")

  /**
   * Quantas linhas cada grupo mostra antes do "mostrar todas".
   *
   * Não é cosmético: um cliente com 500 lojas renderiza 500 linhas com select
   * de unidade, botões e toggles dentro. O navegador engasga e a página vira
   * uma rolagem sem fim — e ninguém confere 500 vínculos de uma vez, confere
   * os primeiros e usa a busca pro resto.
   */
  const LIMITE = 25
  const [expandidos, setExpandidos] = React.useState<Record<string, boolean>>({})

  const unitsFiltradas = React.useMemo(
    () =>
      cliente === "todos"
        ? units
        : units.filter((u) => u.holdingId === cliente),
    [units, cliente],
  )

  // Agrupa por cliente; sem vínculo vai pra um balde próprio que renderiza
  // primeiro. Ordena os clientes por nome, mas o balde fura a fila.
  /**
   * Clientes SUSPENSOS somem de "Conectadas". (Marcus, 20/08/26)
   *
   * A Vbfood aparecia com as duas lojas vinculadas mesmo com o trial vencido
   * em 14/08 — a régua de cobrança já dizia "suspended" e a tela de Clientes
   * já escondia, só esta tabela não olhava. Loja de cliente sem acesso não é
   * operação viva: ela infla o "88 conectadas" e some da conta de quem
   * realmente está pagando.
   *
   * Continuam visíveis em "Pendências" de propósito — se um merchant suspenso
   * aparecer sem vínculo, é coisa pra resolver, não pra esconder.
   */
  const suspensos = React.useMemo(
    () =>
      new Set(
        units.filter((u) => u.suspenso).map((u) => u.holdingName),
      ),
    [units],
  )

  const grupos = React.useMemo(() => {
    const map = new Map<string, MerchantRow[]>()
    for (const m of merchants) {
      const chave = m.ignorado_em
        ? IGNORADAS
        : (byMerchant[m.id]?.holdingName ?? SEM_VINCULO)

      // Cada aba responde UMA pergunta. Sem este corte, "Conectadas" mostrava
      // as pendências junto e a separação não servia pra nada.
      const daAba =
        aba === "ignoradas"
          ? chave === IGNORADAS
          : aba === "pendencias"
            ? chave === SEM_VINCULO
            : chave !== IGNORADAS &&
              chave !== SEM_VINCULO &&
              !suspensos.has(chave)
      if (!daAba) continue

      // A busca varre os quatro jeitos de a mesma loja ser chamada: o nome no
      // iFood, a razão social, o CNPJ e o cliente. Eles divergem na prática —
      // "SABOR MINEIRO" no cadastro é "Marmitaria Ô Mineiro" no iFood.
      if (!combina(busca, m.name, m.corporate_name, m.cnpj, chave)) continue

      if (!map.has(chave)) map.set(chave, [])
      map.get(chave)!.push(m)
    }
    // Pendência primeiro, arquivadas por último, clientes em ordem no meio.
    const peso = (k: string) => (k === SEM_VINCULO ? 0 : k === IGNORADAS ? 2 : 1)
    return [...map.entries()].sort(([a], [b]) =>
      peso(a) !== peso(b) ? peso(a) - peso(b) : a.localeCompare(b, "pt-BR"),
    )
  }, [merchants, byMerchant, aba, busca, suspensos])

  const nomeCliente =
    cliente === "todos"
      ? null
      : (holdings.find((h) => h.id === cliente)?.name ?? null)

  if (merchants.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-3 py-12 text-center text-xs text-muted-foreground">
        Nenhum merchant na cache ainda — clique em{" "}
        <strong>Re-puxar da Merchant API</strong>.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O filtro NÃO esconde linhas: ele restringe as unidades oferecidas nos
          seletores. É o que evita vincular um merchant na loja de outro
          cliente — o erro mais caro desta tela. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Ao vincular, oferecer lojas de:
        </span>
        <select
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        >
          <option value="todos">Todos os clientes</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted-foreground">
          {nomeCliente
            ? `só as ${unitsFiltradas.length} lojas de ${nomeCliente}`
            : "todas as lojas da base — cuidado pra não vincular no cliente errado"}
        </span>
      </div>

      {/* Clientes que só ACOMPANHAM loja de terceiro não têm merchant e por
          isso não apareciam em lugar nenhum desta tela — o cliente existia,
          pagava e era invisível aqui. */}
      {Object.entries(compartilhadas)
        .filter(([nome]) => !grupos.some(([g]) => g === nome))
        .map(([nome, lojas]) => (
          <div key={`so-acompanha-${nome}`} className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Building2 className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{nome}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                0 conectada
              </span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                {lojas.length} acompanhada{lojas.length > 1 ? "s" : ""}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {lojas
                  .map((l) => `#${l.code} ${l.name} · de ${l.donaNome}`)
                  .join(" · ")}
              </span>
            </div>
          </div>
        ))}

      {grupos.map(([nome, lista]) => {
        const semVinculo = nome === SEM_VINCULO
        const arquivadas = nome === IGNORADAS
        const conectadas = lista.filter((m) => byMerchant[m.id]).length
        const acompanha = compartilhadas[nome] ?? []
        return (
          // Cliente nasce FECHADO. Com 58 lojas em 4 clientes, a tela abria com
          // uma rolagem que enterrava o único bloco que pede ação. Já "Sem
          // unidade vinculada" nasce ABERTO: é exatamente o que exige ação, e
          // escondê-lo atrás de um clique seria esconder o motivo da tela.
          <details
            key={nome}
            {...(semVinculo ? { open: true } : {})}
            className={`group/cli overflow-hidden rounded-xl border ${
              semVinculo
                ? "border-amber-300 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
                : arquivadas
                  ? "bg-muted/30 opacity-75"
                  : "bg-card"
            }`}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 border-b px-4 py-2.5 transition-colors hover:bg-muted/40">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/cli:rotate-90" />
              {semVinculo ? (
                <AlertTriangle className="size-4 text-amber-600" />
              ) : arquivadas ? (
                <Archive className="size-4 text-muted-foreground" />
              ) : (
                <Building2 className="size-4 text-muted-foreground" />
              )}
              <h3 className="text-sm font-semibold">
                {semVinculo
                  ? "Sem unidade vinculada"
                  : arquivadas
                    ? "Ignoradas"
                    : nome}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {semVinculo || arquivadas
                  ? `${lista.length} loja${lista.length > 1 ? "s" : ""}`
                  : `${conectadas} de ${lista.length} conectada${lista.length > 1 ? "s" : ""}`}
              </span>
              {acompanha.length > 0 && (
                <span
                  className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                  title={acompanha
                    .map((l) => `#${l.code} ${l.name} (de ${l.donaNome})`)
                    .join("\n")}
                >
                  + {acompanha.length} acompanhada
                  {acompanha.length > 1 ? "s" : ""}
                </span>
              )}
              {semVinculo && (
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  escolha a unidade da rede pra cada uma — até lá o sync não
                  passa por elas
                </span>
              )}
              {arquivadas && (
                <span className="text-[11px] text-muted-foreground">
                  lojas que não viram unidade da rede (teste, desativada). Não
                  voltam pras pendências no re-puxar.
                </span>
              )}
            </summary>

            <ul className="divide-y">
              {(expandidos[nome] ? lista : lista.slice(0, LIMITE)).map((m) => {
                const linked = byMerchant[m.id]
                const st = rotuloStatus(m.merchant_state)
                const local = [m.city, m.state].filter(Boolean).join("/")
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-[220px] flex-1">
                      <p className="text-sm font-medium">
                        {m.name ?? m.corporate_name ?? "—"}
                      </p>
                      {m.corporate_name && m.corporate_name !== m.name && (
                        <p className="text-[11px] text-muted-foreground">
                          {m.corporate_name}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {local && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="size-3" />
                            {local}
                          </span>
                        )}
                        {st && (
                          <span className={`text-[11px] ${st.tom}`}>
                            · {st.txt}
                          </span>
                        )}
                        {m.cnpj && (
                          <Copiavel
                            valor={m.cnpj.replace(/\D/g, "")}
                            label={fmtCnpj(m.cnpj) ?? "CNPJ"}
                          />
                        )}
                        <Copiavel valor={m.id} label="ID" />
                      </div>
                    </div>

                    <div className="min-w-[260px]">
                      {linked ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {linked.code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {linked.name}
                            </span>
                            {linked.unidadeInativa && (
                              <span
                                title="Unidade desativada na rede, mas ainda vinculada a este merchant"
                                className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"
                              >
                                inativa
                              </span>
                            )}
                            <LinkRow
                              merchantId={m.id}
                              currentUnitId={linked.unitId}
                              units={unitsFiltradas}
                              /* Dono deduzido pelo CNPJ do merchant: o
                                 seletor abre só nas lojas dele. */
                              holdingSugerido={
                                donoPorCnpj?.[
                                  String(m.cnpj ?? "").replace(/\D/g, "")
                                ] ?? null
                              }
                            />
                          </div>
                          <AppToggles
                            unitId={linked.unitId}
                            finOn={linked.finOn}
                            reviewOn={linked.reviewOn}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <LinkRow
                            merchantId={m.id}
                            currentUnitId={null}
                            units={unitsFiltradas}
                            /* ⚠️ Este é o LinkRow das NÃO VINCULADAS — o que o
                               admin de fato usa. Passei o cliente só no outro
                               (das já vinculadas) e o filtro não pegou. Se
                               mexer num, mexa nos dois. */
                            holdingSugerido={
                              donoPorCnpj?.[
                                String(m.cnpj ?? "").replace(/\D/g, "")
                              ] ?? null
                            }
                          />
                          <BotaoIgnorar
                            merchantId={m.id}
                            ignorado={Boolean(m.ignorado_em)}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {lista.length > LIMITE && !expandidos[nome] && (
              <button
                type="button"
                onClick={() => setExpandidos((e) => ({ ...e, [nome]: true }))}
                className="w-full border-t px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                mostrar as outras {lista.length - LIMITE} lojas
              </button>
            )}
          </details>
        )
      })}
    </div>
  )
}
