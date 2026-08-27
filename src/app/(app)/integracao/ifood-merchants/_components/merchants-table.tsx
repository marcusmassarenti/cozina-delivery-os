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
import { LinkRow, type DonoSugerido } from "./link-row"

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
}
type Linked = {
  unitId: string
  code: string
  name: string
  /** "OK do admin" por app — cada um é autorizado à parte no portal iFood. */
  finOn: boolean
  reviewOn: boolean
  holdingName: string
  /** Cliente fora da operação: suspenso, encerrado ou conta interna. */
  holdingFora?: boolean
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

/**
 * Como o dono foi deduzido, em português — e o quanto vale confiar.
 *
 * Aparece junto do nome do cliente porque as três pistas NÃO têm o mesmo
 * peso: CNPJ completo é identidade, razão social é indício. Quem vai clicar
 * em "Vincular" merece saber em qual das duas está se apoiando.
 */
const PISTA: Record<DonoSugerido["via"], { txt: string; ajuda: string }> = {
  cnpj: {
    txt: "por CNPJ",
    ajuda: "O CNPJ do merchant bate com o cadastro da loja ou com a solicitação de conexão.",
  },
  raiz: {
    txt: "pela raiz do CNPJ",
    ajuda:
      "Os 8 primeiros dígitos do CNPJ batem — mesma empresa, filial diferente. Confira antes de vincular.",
  },
  razao: {
    txt: "pela razão social",
    ajuda:
      "Este merchant não tem CNPJ, mas a razão social é idêntica à de outro merchant deste cliente. É indício, não prova — confira antes de vincular.",
  },
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
  donoPorMerchant,
  byMerchant,
  compartilhadas = {},
  aba,
  busca,
}: {
  merchants: MerchantRow[]
  units: UnitOption[]
  holdings: { id: string; name: string }[]
  /** merchant id → cliente deduzido (CNPJ, raiz do CNPJ ou razão social). */
  donoPorMerchant?: Record<string, DonoSugerido>
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
        Object.values(byMerchant)
          .filter((v) => v.holdingFora)
          .map((v) => v.holdingName),
      ),
    [byMerchant],
  )

  const grupos = React.useMemo(() => {
    const map = new Map<string, MerchantRow[]>()
    for (const m of merchants) {
      /* O VÍNCULO manda mais que o arquivamento.
       *
       * Era `ignorado_em ? IGNORADAS : ...` — o carimbo vencia sempre, então
       * um merchant arquivado e depois vinculado ficava preso em "Ignoradas"
       * exibindo "Vinculado" e "Restaurar" lado a lado. A ação de vincular
       * agora limpa o carimbo, mas a precedência aqui vale como segunda
       * trava: se o carimbo sobreviver por qualquer caminho (importação,
       * script, ajuste no banco), a tela ainda mostra a loja onde ela está
       * de fato — no cliente dela. */
      const vinculo = byMerchant[m.id]
      const chave = vinculo
        ? vinculo.holdingName
        : m.ignorado_em
          ? IGNORADAS
          : SEM_VINCULO

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
    /* Dentro de "Sem unidade vinculada", as lojas do MESMO cliente ficam
       juntas. (Marcus, 27/08/26: "a ordem tá pulando Le Brunch primeiro e
       depois DG FOODS e volta pra Le Brunch".)
       A lista vinha na ordem do banco, e como cada linha carrega o nome do
       cliente, o olho ia e voltava entre dois clientes o tempo todo. Quem
       resolve pendência resolve por cliente — abre o portal daquele cliente
       uma vez e despacha as lojas dele.
       Sem dono deduzido vai pro fim: é a fila que precisa de decisão humana. */
    const pend = map.get(SEM_VINCULO)
    if (pend) {
      const dono = (m: MerchantRow) => donoPorMerchant?.[m.id]?.name ?? null
      pend.sort((a, b) => {
        const da = dono(a)
        const db = dono(b)
        if (da !== db) {
          if (!da) return 1
          if (!db) return -1
          return da.localeCompare(db, "pt-BR")
        }
        return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
      })
    }

    // Pendência primeiro, arquivadas por último, clientes em ordem no meio.
    const peso = (k: string) => (k === SEM_VINCULO ? 0 : k === IGNORADAS ? 2 : 1)
    return [...map.entries()].sort(([a], [b]) =>
      peso(a) !== peso(b) ? peso(a) - peso(b) : a.localeCompare(b, "pt-BR"),
    )
  }, [merchants, byMerchant, aba, busca, suspensos, donoPorMerchant])

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
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4">
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
              {(expandidos[nome] ? lista : lista.slice(0, LIMITE)).map((m, i, visiveis) => {
                const linked = byMerchant[m.id]
                const st = rotuloStatus(m.merchant_state)
                const local = [m.city, m.state].filter(Boolean).join("/")

                /* Subcabeçalho quando o cliente muda. A lista já vem ordenada
                   por cliente, então comparar com o anterior basta — e ele
                   acompanha o recorte visível, senão o primeiro bloco depois
                   de "mostrar as outras" apareceria sem título. */
                const donoAtual = semVinculo
                  ? (donoPorMerchant?.[m.id]?.name ?? null)
                  : null
                const donoAnterior =
                  semVinculo && i > 0
                    ? (donoPorMerchant?.[visiveis[i - 1].id]?.name ?? null)
                    : undefined
                const abreCliente =
                  semVinculo && (i === 0 || donoAtual !== donoAnterior)
                const quantas = semVinculo
                  ? lista.filter(
                      (x) => (donoPorMerchant?.[x.id]?.name ?? null) === donoAtual,
                    ).length
                  : 0

                return (
                  <React.Fragment key={m.id}>
                  {abreCliente && (
                    <li className="flex items-center gap-2 bg-amber-100/60 px-3 py-1.5 sm:px-4 dark:bg-amber-950/40">
                      {donoAtual ? (
                        <>
                          <Building2 className="size-3.5 text-amber-800 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                            {donoAtual}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                            Cliente não identificado
                          </span>
                        </>
                      )}
                      <span className="text-[10px] text-amber-800/80 dark:text-amber-400/80">
                        {quantas} loja{quantas > 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  <li
                    className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-3 sm:px-4"
                  >
                    {/* No celular a coluna ocupa a linha inteira. Com
                        `min-w-[220px]` fixo ela ficava mais larga que o cartão
                        (que é overflow-hidden) e a loja simplesmente sumia da
                        tela — não dava nem pra rolar até ela. */}
                    <div className="w-full min-w-0 flex-1 sm:min-w-[220px]">
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
                        {/* O id do merchant é dado técnico: fica atrás do
                            "..." em vez de ocupar a linha ao lado do nome do
                            cliente. Continua a um clique pra conferir no
                            Portal do Desenvolvedor. */}
                        <Copiavel valor={m.id} label="ID iFood" />
                      </div>

                      {/* DE QUEM É ESTA LOJA — a pergunta que a tela não
                          respondia. (Marcus, 27/08/26: "quem é o cliente que
                          tem essa unidade?")
                          O dono ficava escondido dentro do texto do botão
                          "1 de Grupo Le Brunch · ver todas", do lado direito,
                          em 10px. Quem varre a coluna da esquerda pra decidir
                          o que fazer não via cliente nenhum. */}
                      {/* Só a PISTA — o nome do cliente já está no
                          subcabeçalho logo acima. Ela fica na linha, e não no
                          cabeçalho, porque varia dentro do mesmo cliente: as
                          duas do Grupo Le Brunch chegaram por caminhos
                          diferentes, uma por CNPJ e outra por razão social. */}
                      {!linked && donoPorMerchant?.[m.id] && (
                        <p
                          className="mt-1 text-[10px] text-muted-foreground"
                          title={PISTA[donoPorMerchant[m.id].via].ajuda}
                        >
                          identificado {PISTA[donoPorMerchant[m.id].via].txt}
                        </p>
                      )}
                    </div>

                    <div className="w-full min-w-0 sm:w-auto sm:min-w-[260px]">
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
                              units={units}
                              /* Dono deduzido do merchant: o seletor abre
                                 só nas lojas dele. */
                              holdingSugerido={donoPorMerchant?.[m.id] ?? null}
                              holdings={holdings}
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
                            units={units}
                            /* ⚠️ Este é o LinkRow das NÃO VINCULADAS — o que o
                               admin de fato usa. Passei o cliente só no outro
                               (das já vinculadas) e o filtro não pegou. Se
                               mexer num, mexa nos dois. */
                            holdingSugerido={donoPorMerchant?.[m.id] ?? null}
                            holdings={holdings}
                          />
                          <BotaoIgnorar
                            merchantId={m.id}
                            ignorado={Boolean(m.ignorado_em)}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                  </React.Fragment>
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
