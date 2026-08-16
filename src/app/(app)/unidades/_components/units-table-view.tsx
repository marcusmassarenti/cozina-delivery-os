"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Plus,
  Search,
  Table2,
  X,
} from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo, type CanalId } from "@/components/platform-logo"
import { type CoachStep } from "@/components/onboarding/coach-tour"
import { TourButton } from "@/components/onboarding/tour-button"
import { camposFaltando } from "@/lib/cadastro-campos"
import { textoCobertura } from "@/lib/plataforma-api"
// ⚠️ Do módulo de TIPOS, nunca de `units-page.ts`: aquele é `server-only` e
// puxa next/headers — importar um valor de lá daqui quebra o build inteiro.
import {
  POR_PAGINA_OPCOES,
  type FiltrosUnidades,
  type LinhaUnidade,
  type OrdemUnidades,
  type PaginaUnidades,
} from "@/lib/data/units-page-tipos"
import { DeleteUnitButton } from "./delete-unit-button"
import { EditUnitDialog } from "./edit-unit-dialog"
import { NewUnitDialog } from "./new-unit-dialog"
import { ImportarPlanilhaDialog } from "./importar-planilha-dialog"

/**
 * A listagem de Unidades em TABELA, paginada.
 *
 * ── POR QUE DEIXOU DE SER CARDS (16/08/26) ───────────────────────────────
 * A grade de cards renderizava a rede inteira de uma vez, 4 por linha. Com as
 * 487 lojas do maior cliente seriam 122 linhas de rolagem e 443 KB no primeiro
 * carregamento — e, pior que o peso, todas as lojas com o mesmo relevo visual:
 * não dava pra saber onde olhar.
 *
 * A tabela cabe ~20 por tela contra 8 do card, e o Marcus escolheu 50 por
 * página para TODO MUNDO, inclusive quem tem 10 lojas — um comportamento só é
 * mais fácil de entender do que dois.
 *
 * ⚠️ O LOGO É A PRIMEIRA COLUNA, e isso não é enfeite: numa lista de 50 linhas
 * quase idênticas, o logo é o que faz a loja ser reconhecida antes de o nome
 * ser lido. Foi a condição do Marcus pra aceitar a tabela ("quero eles com o
 * logo da unidade para personalizar").
 *
 * ── A URL É A FONTE DA VERDADE ───────────────────────────────────────────
 * Busca, filtros, ordenação e página vivem nos searchParams e são resolvidos no
 * SERVIDOR. Isso é o que dá sentido à paginação: com o filtro no cliente, o
 * navegador continuaria recebendo as 487 lojas pra filtrar em memória e o ganho
 * seria só visual. De brinde, o link fica colável — "olha essas lojas aqui".
 */

const ALL_PLATFORMS: { id: CanalId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
  { id: "cardapioweb", label: "Cardápio Web" },
]

/** Mesmo rótulo do filtro, indexado — pro tooltip do logo na linha. */
const ROTULO_PLATAFORMA = Object.fromEntries(
  ALL_PLATFORMS.map((p) => [p.id, p.label]),
) as Record<CanalId, string>

const TOUR_STEPS: CoachStep[] = [
  {
    selector: '[data-tour="un-novo"]',
    icon: <Plus className="size-4" />,
    title: "Cadastre suas lojas",
    body: "Clica em 'Nova unidade' pra adicionar uma loja — nome, cidade e plataformas (iFood, 99, Keeta).",
  },
  {
    selector: '[data-tour="un-filtros"]',
    icon: <Filter className="size-4" />,
    title: "Filtre e busque",
    body: "A busca e os filtros rodam no servidor: você acha a loja mesmo que a rede tenha centenas. Procure por nome, código, cidade ou CNPJ.",
  },
  {
    selector: '[data-tour="un-lista"]',
    icon: <Table2 className="size-4" />,
    title: "Suas lojas",
    body: "Clique no cabeçalho pra ordenar e numa linha pra abrir a loja. A coluna Cadastro mostra o que ainda falta preencher.",
  },
]

const CHAVE_POR_PAGINA = "unidades:por-pagina"

export function UnitsTableView({
  pagina,
  filtros,
  canEdit = false,
  canDelete = false,
  brandLogoUrl,
  cadastroExigente = false,
  ifoodApiPorUnidade = {},
  nineApiPorUnidade = {},
}: {
  pagina: PaginaUnidades
  filtros: FiltrosUnidades
  canEdit?: boolean
  canDelete?: boolean
  brandLogoUrl?: string | null
  cadastroExigente?: boolean
  ifoodApiPorUnidade?: Record<string, "conectada" | "andamento">
  nineApiPorUnidade?: Record<string, "conectada" | "andamento">
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /** Reescreve a URL preservando o resto dos filtros. */
  const aplicar = React.useCallback(
    (mudancas: Record<string, string | null>, manterPagina = false) => {
      const p = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === null || v === "") p.delete(k)
        else p.set(k, v)
      }
      // Mexeu em filtro? Volta pra página 1. Sem isto, filtrar estando na
      // página 7 deixa a tela vazia e parece que a busca não achou nada.
      if (!manterPagina) p.delete("p")
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // ── Busca: digita agora, consulta quase junto ─────────────────────────
  //
  // Eram 350 ms de espera e a busca "demorava" (Marcus, 16/08). 350 ms é o
  // limiar em que a pessoa percebe que a tela travou — bom pra economizar
  // consulta, ruim pra quem está procurando uma loja. Baixou pra 120 ms, que
  // ainda junta as teclas de quem digita rápido sem parecer lento.
  //
  // O `useTransition` é a outra metade: sem ele o React congela o input
  // enquanto o servidor responde, e aí a lentidão fica no CAMPO, que é onde
  // mais incomoda. Com ele o texto aparece na hora e só a tabela espera.
  const [busca, setBusca] = React.useState(filtros.q)
  const buscaAplicada = React.useRef(filtros.q)
  const [buscando, iniciarBusca] = React.useTransition()
  React.useEffect(() => {
    if (busca === buscaAplicada.current) return
    const t = setTimeout(() => {
      buscaAplicada.current = busca
      iniciarBusca(() => aplicar({ q: busca || null }))
    }, 120)
    return () => clearTimeout(t)
  }, [busca, aplicar])

  // ── Quantas por página: escolha do usuário, lembrada ──────────────────
  // Fica no localStorage e não no cadastro porque é preferência de quem olha,
  // não do cliente: o mesmo usuário quer 100 no notebook e 25 no celular.
  React.useEffect(() => {
    if (searchParams.has("por")) {
      localStorage.setItem(CHAVE_POR_PAGINA, String(filtros.perPage))
      return
    }
    const salvo = Number(localStorage.getItem(CHAVE_POR_PAGINA))
    if (salvo && salvo !== filtros.perPage) {
      aplicar({ por: String(salvo) }, true)
    }
  }, [searchParams, filtros.perPage, aplicar])

  const ordenarPor = (col: OrdemUnidades) => {
    const mesmaColuna = filtros.sort === col
    const dir = mesmaColuna && filtros.dir === "asc" ? "desc" : "asc"
    aplicar({ ord: col, dir }, true)
  }

  const togglePlataforma = (id: CanalId) => {
    const atual = new Set(filtros.platforms)
    if (atual.has(id)) atual.delete(id)
    else atual.add(id)
    aplicar({ plat: Array.from(atual).join(",") || null })
  }

  // `onlyActive` não conta como filtro: é o estado padrão da tela, e marcá-lo
  // como "filtro ativo" faria o botão Limpar aparecer sempre.
  const temFiltro =
    filtros.q !== "" ||
    filtros.city !== "" ||
    filtros.platforms.length > 0 ||
    !filtros.onlyActive ||
    filtros.comPendencia

  const limpar = () => {
    setBusca("")
    buscaAplicada.current = ""
    router.replace(pathname, { scroll: false })
  }

  /**
   * ── BUSCA QUE RESPONDE NA TECLA ───────────────────────────────────────
   *
   * Mesmo com 120 ms de espera, a busca "não estava instantânea" (Marcus,
   * 16/08) — e não ia ficar: entre a tecla e a tabela tem debounce, ida ao
   * servidor e re-render. Enquanto isso a tabela ficava parada mostrando o
   * resultado velho, que é o que dá a sensação de travamento.
   *
   * A solução é filtrar a PÁGINA JÁ CARREGADA na hora, enquanto a resposta de
   * verdade não chega. A pessoa digita "rib" e as linhas somem no mesmo
   * quadro; quando o servidor responde, a lista certa entra por cima.
   *
   * ⚠️ É um retrato PARCIAL de propósito — só filtra as 50 linhas que já estão
   * na tela, e a loja procurada pode estar na página 3. Por isso duas regras:
   *
   *   1. compara sem acento, igual ao banco (senão "ribeira" sumia com tudo
   *      e a prévia mostraria vazio pra uma busca que ACHA no servidor);
   *   2. enquanto está buscando, NUNCA mostra "nenhuma unidade encontrada" —
   *      dizer que não existe antes de perguntar ao servidor é mentir.
   */
  const semAcento = React.useCallback(
    (t: string) =>
      t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
    [],
  )
  const linhasVisiveis = React.useMemo(() => {
    const termo = semAcento(busca.trim())
    if (!termo || termo === semAcento(filtros.q.trim())) return pagina.linhas
    return pagina.linhas.filter((l) =>
      [l.name, l.code, l.city ?? ""].some((campo) =>
        semAcento(campo).includes(termo),
      ),
    )
  }, [pagina.linhas, busca, filtros.q, semAcento])

  const preFiltrando = linhasVisiveis !== pagina.linhas

  const primeiro = pagina.total === 0 ? 0 : (pagina.page - 1) * pagina.perPage + 1
  const ultimo = Math.min(pagina.page * pagina.perPage, pagina.total)

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
            {pagina.total > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
                {pagina.total} {pagina.total === 1 ? "loja" : "lojas"}
                {temFiltro ? " no filtro" : ""}
              </span>
            )}
            <TourButton steps={TOUR_STEPS} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Escolhe uma unidade pra ver detalhes do mês
          </p>
        </div>
        <div data-tour="un-novo" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            {buscando ? (
              <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, código, cidade ou CNPJ…"
              className="h-9 w-64 rounded-md border bg-card pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          {/* Exportar é um LINK, não um diálogo: baixar a própria lista não
              tem nada pra explicar nem pra confirmar. Só importar precisa de
              passo a passo, porque é o que escreve no banco. */}
          <a
            href="/api/unidades/planilha?tipo=dados"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
            title="Baixa as suas lojas em Excel, já preenchidas. Editar e trazer de volta atualiza o cadastro."
          >
            <Download className="size-3.5" />
            Exportar unidades
          </a>
          {canEdit && <ImportarPlanilhaDialog />}
          {canEdit && <NewUnitDialog cadastroExigente={cadastroExigente} />}
        </div>
      </div>

      {/* Filtros */}
      <div
        data-tour="un-filtros"
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
      >
        <Filter className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtros
        </span>

        <select
          value={filtros.city}
          onChange={(e) => aplicar({ cidade: e.target.value || null })}
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        >
          <option value="">Todas as cidades</option>
          {pagina.cidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          {ALL_PLATFORMS.map((p) => {
            const ativo = filtros.platforms.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlataforma(p.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  ativo
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground opacity-70 hover:opacity-100"
                }`}
              >
                <PlatformLogo platform={p.id} size="sm" />
                {p.label}
              </button>
            )
          })}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={filtros.onlyActive}
            // Ligado por padrão (16/08): a tela é de operação, e loja fechada
            // só atrapalha a leitura. Desmarcar grava `ativas=0` na URL —
            // ausente significa LIGADO, não desligado.
            onChange={(e) => aplicar({ ativas: e.target.checked ? null : "0" })}
            className="size-3.5 rounded border-border"
          />
          Só ativas
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={filtros.comPendencia}
            onChange={(e) => aplicar({ pend: e.target.checked ? "1" : null })}
            className="size-3.5 rounded border-border"
          />
          Só com cadastro incompleto
        </label>

        {temFiltro && (
          <button
            type="button"
            onClick={limpar}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {linhasVisiveis.length === 0 && !buscando && !preFiltrando ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <p className="text-sm font-medium">
            {temFiltro
              ? "Nenhuma unidade bate com os filtros"
              : "Nenhuma unidade cadastrada"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {temFiltro
              ? "Tente afrouxar a busca ou limpar os filtros."
              : 'Clique em "+ Nova Unidade" acima pra cadastrar a primeira loja da rede.'}
          </p>
          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="mt-3 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div
          data-tour="un-lista"
          className="overflow-hidden rounded-xl border bg-card"
        >
          {/* A tabela é larga: rola dentro do próprio quadro em vez de
              empurrar a página inteira pro lado no celular. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-[52px] py-2.5 pl-3" />
                  <Cabecalho
                    col="code"
                    label="#"
                    filtros={filtros}
                    onClick={ordenarPor}
                    className="w-[64px]"
                  />
                  <Cabecalho
                    col="name"
                    label="Unidade"
                    filtros={filtros}
                    onClick={ordenarPor}
                  />
                  <Cabecalho
                    col="city"
                    label="Cidade"
                    filtros={filtros}
                    onClick={ordenarPor}
                  />
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Plataformas
                  </th>
                  <Cabecalho
                    col="faltando"
                    label="Cadastro"
                    filtros={filtros}
                    onClick={ordenarPor}
                  />
                  {/* Cabeçalho nomeado: o ícone sozinho no canto direito não
                      dizia o que era, e a pessoa não achava onde editar. */}
                  <th className="w-[92px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Editar
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-sm text-muted-foreground"
                    >
                      Procurando…
                    </td>
                  </tr>
                ) : null}
                {linhasVisiveis.map((u) => (
                  <Linha
                    key={u.id}
                    u={u}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    brandLogoUrl={brandLogoUrl}
                    cadastroExigente={cadastroExigente}
                    ifoodApi={ifoodApiPorUnidade[u.id]}
                    nineApi={nineApiPorUnidade[u.id]}
                    onOpen={() => navigate(`/unidades/${u.code}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé: quantas está vendo, quantas por página, e as páginas */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-xs text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Durante a prévia local a contagem do servidor ainda é a da
                  busca anterior — dizer "13 de 13" com 1 linha na tela seria
                  um número errado piscando. */}
              <span>
                {preFiltrando || buscando ? (
                  "Procurando…"
                ) : (
                  <>
                    Mostrando{" "}
                    <strong className="text-foreground">
                      {primeiro}–{ultimo}
                    </strong>{" "}
                    de <strong className="text-foreground">{pagina.total}</strong>
                  </>
                )}
              </span>
              {/* Legenda da bolinha. Sem ela o ponto verde vira enfeite: quem
                  não acompanhou a mudança não tem como adivinhar o que é. */}
              <span
                className="flex items-center gap-1.5"
                title="A bolinha marca a plataforma que sincroniza sozinha. Passe o mouse no logo pra ver o que entra e o que ainda depende de planilha."
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                sincroniza sozinho —{" "}
                <span className="underline decoration-dotted underline-offset-2">
                  passe o mouse no logo pra ver o quê
                </span>
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              por página
              {POR_PAGINA_OPCOES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => aplicar({ por: String(n) })}
                  className={`rounded-md border px-2 py-1 font-semibold transition-colors ${
                    n === pagina.perPage
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </span>

            {pagina.totalPaginas > 1 && (
              <Paginas
                page={pagina.page}
                totalPaginas={pagina.totalPaginas}
                ir={(p) => aplicar({ p: String(p) }, true)}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Cabecalho({
  col,
  label,
  filtros,
  onClick,
  className = "",
}: {
  col: OrdemUnidades
  label: string
  filtros: FiltrosUnidades
  onClick: (c: OrdemUnidades) => void
  className?: string
}) {
  const ativo = filtros.sort === col
  return (
    <th className={`px-3 py-2.5 text-left ${className}`}>
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          ativo ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {ativo &&
          (filtros.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          ))}
      </button>
    </th>
  )
}

function Linha({
  u,
  canEdit,
  canDelete,
  brandLogoUrl,
  cadastroExigente,
  ifoodApi,
  nineApi,
  onOpen,
}: {
  u: LinhaUnidade
  canEdit: boolean
  canDelete: boolean
  brandLogoUrl?: string | null
  cadastroExigente: boolean
  ifoodApi?: "conectada" | "andamento"
  nineApi?: "conectada" | "andamento"
  onOpen: () => void
}) {
  // O que falta, por extenso, pro `title` da célula. O número vem do banco
  // (a RPC conta igual); os nomes vêm daqui porque a linha já tem os campos.
  const faltam = React.useMemo(
    () =>
      camposFaltando(
        {
          cnpj: u.cnpj,
          razao_social: u.razaoSocial,
          tipo_cozinha: u.tipoCozinha,
          logradouro: u.logradouro,
          numero: u.numero,
          bairro: u.bairro,
          cep: u.cep,
          telefone: u.telefone,
          responsavel_nome: u.responsavelNome,
          tipo_operacao: u.tipoOperacao,
          regime_fiscal: u.regimeFiscal,
          tipo_entrega: u.tipoEntrega,
          data_inauguracao: u.dataInauguracao,
        },
        { temPlataforma: u.platforms.length > 0 },
      ),
    [u],
  )

  return (
    <tr
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`group cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40 ${
        !u.active ? "opacity-55" : ""
      }`}
    >
      {/* ⚠️ O logo é o que dá relevo à linha — ver o cabeçalho do arquivo. */}
      <td className="py-2 pl-3">
        <BrandLogo
          size="sm"
          logoUrl={u.logoUrl ?? brandLogoUrl}
          name={u.name}
        />
      </td>

      <td className="px-3 py-2">
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {u.code}
        </span>
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-semibold">{u.name}</span>
          {!u.active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Inativa
            </span>
          )}
          {u.compartilhada && (
            <span
              className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
              title={`Compartilhada por ${u.compartilhada.donaNome} — você acompanha, quem edita é a empresa dona.`}
            >
              Compartilhada
            </span>
          )}
        </div>
      </td>


      <td className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground">
        {u.city ? `${u.city}${u.state ? ` · ${u.state}` : ""}` : "—"}
      </td>

      <td className="px-3 py-2">
        {u.platforms.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="flex items-center gap-1.5">
            {u.platforms.map((p) => {
              const conectada =
                (p === "ifood" && ifoodApi === "conectada") ||
                (p === "99food" && nineApi === "conectada") ||
                p === "cardapioweb"
              return (
                <PlatformLogo
                  key={p}
                  platform={p}
                  size="sm"
                  /**
                   * ⚠️ Bolinha verde = ENTRA SOZINHO, não "está resolvido".
                   *
                   * O tooltip diz exatamente o quê: no iFood são financeiro,
                   * pedidos e avaliações — cardápio, qualidade, promoções e
                   * Super continuam dependendo de planilha. Selo que promete
                   * mais do que entrega faz parar de conferir.
                   *
                   * O Cardápio Web não ganha o ponto (ele SÓ existe por API,
                   * então o ponto estaria em 100% deles e não separaria nada),
                   * mas ganha o tooltip — ali a informação é útil.
                   */
                  viaApi={p === "ifood" || p === "99food" ? conectada : false}
                  titulo={textoCobertura(p, ROTULO_PLATAFORMA[p], conectada)}
                />
              )
            })}
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        {/* Loja inativa não é cobrada: ela não vai ser cadastrada de novo. */}
        {!u.active ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : u.faltando === 0 ? (
          <span className="text-xs text-muted-foreground">completo</span>
        ) : (
          <span
            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            title={`Falta ${faltam.join(", ")}.`}
          >
            faltam {u.faltando}
          </span>
        )}
      </td>


      <td
        className="px-3 py-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* ⚠️ SEMPRE VISÍVEL. Antes só aparecia no hover, e o Marcus não achava
            onde editar — com razão: um botão que só existe depois que o mouse
            passa por cima é um botão que não existe pra quem está procurando.
            No hover ele ganha contraste, mas nunca some. */}
        <div className="flex items-center justify-end gap-0.5 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canEdit && (
            <EditUnitDialog
              inline
              cadastroExigente={cadastroExigente}
              ifoodApi={
                u.platforms.includes("ifood")
                  ? (ifoodApi ?? "disponivel")
                  : undefined
              }
              nineApi={
                u.platforms.includes("99food")
                  ? (nineApi ?? "disponivel")
                  : undefined
              }
              unit={{
                unitId: u.id,
                code: u.code,
                name: u.name,
                city: u.city,
                state: u.state,
                cnpj: u.cnpj,
                active: u.active,
                dataInauguracao: u.dataInauguracao,
                dataEncerramento: u.dataEncerramento,
                razaoSocial: u.razaoSocial,
                tipoCozinha: u.tipoCozinha,
                tipoOperacao: u.tipoOperacao,
                regimeFiscal: u.regimeFiscal,
                tipoEntrega: u.tipoEntrega,
                logradouro: u.logradouro,
                numero: u.numero,
                complemento: u.complemento,
                bairro: u.bairro,
                cep: u.cep,
                telefone: u.telefone,
                responsavelNome: u.responsavelNome,
                responsavelEmail: u.responsavelEmail,
                cnaeDescricao: u.cnaeDescricao,
                situacaoCadastral: u.situacaoCadastral,
                platforms: u.platforms,
                externalStoreIds: u.externalStoreIds,
                platformInauguracoes: u.platformInauguracoes,
                logoUrl: u.logoUrl,
              }}
            />
          )}
          {canDelete && <DeleteUnitButton unitId={u.id} unitName={u.name} />}
        </div>
      </td>
    </tr>
  )
}

/**
 * Botão de página. Fica FORA do `Paginas` de propósito: componente declarado
 * dentro de outro é recriado a cada render e perde o estado — o lint do React
 * pega isso, e aqui custaria o foco do teclado ao trocar de página.
 */
function BotaoPagina({
  children,
  onClick,
  ativo = false,
  desabilitado = false,
  rotulo,
}: {
  children: React.ReactNode
  onClick?: () => void
  ativo?: boolean
  desabilitado?: boolean
  rotulo?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      aria-current={ativo ? "page" : undefined}
      className={`grid h-7 min-w-7 place-items-center rounded-md border px-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
        ativo
          ? "border-foreground bg-foreground text-background"
          : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

/** Páginas com reticências — 20 botões numa linha não ajudam ninguém. */
function Paginas({
  page,
  totalPaginas,
  ir,
}: {
  page: number
  totalPaginas: number
  ir: (p: number) => void
}) {
  const nums: (number | "…")[] = []
  const perto = (n: number) => Math.abs(n - page) <= 1
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || perto(n)) nums.push(n)
    else if (nums[nums.length - 1] !== "…") nums.push("…")
  }

  return (
    <span className="flex items-center gap-1">
      <BotaoPagina
        onClick={() => ir(page - 1)}
        desabilitado={page <= 1}
        rotulo="Página anterior"
      >
        <ChevronLeft className="size-3.5" />
      </BotaoPagina>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <BotaoPagina key={n} onClick={() => ir(n)} ativo={n === page}>
            {n}
          </BotaoPagina>
        ),
      )}
      <BotaoPagina
        onClick={() => ir(page + 1)}
        desabilitado={page >= totalPaginas}
        rotulo="Próxima página"
      >
        <ChevronRight className="size-3.5" />
      </BotaoPagina>
    </span>
  )
}
