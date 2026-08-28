"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ExternalLink,
  GripVertical,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SeletorBusca } from "@/components/shared/seletor-busca"
import { fmtBRL } from "@/lib/format"
import type { Etapa, LojaOnboarding } from "@/lib/data/carteira-onboarding-tipos"

import {
  adicionarAoQuadro,
  criarEtapa,
  criarVendedor,
  editarEtapa,
  moverParaEtapa,
  salvarOnboarding,
  salvarVenda,
  type OnboardingState,
} from "../_actions"

export type Vendedor = { id: string; nome: string }
export type LojaLivre = { id: string; code: string; nome: string }

const INICIAL: OnboardingState = { ok: false }

/** ISO → "2026-08-28T14:30", que é o que o datetime-local aceita. */
function paraInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function OnboardingView({
  lojas,
  etapas,
  vendedores,
  livres,
}: {
  lojas: LojaOnboarding[]
  etapas: Etapa[]
  vendedores: Vendedor[]
  livres: LojaLivre[]
}) {
  const router = useRouter()
  const [ficha, setFicha] = React.useState<string | null>(null)
  const [gerindo, setGerindo] = React.useState(false)
  /* Arrasto do quadro. `arrastando` é a loja na mão; `alvo` é a coluna sob o
     cursor — sem ela, quem arrasta não sabe onde vai soltar. */
  const [arrastando, setArrastando] = React.useState<string | null>(null)
  const [alvo, setAlvo] = React.useState<string | null | undefined>(undefined)
  const [pendente, iniciar] = React.useTransition()

  const soltar = (unitId: string, etapaId: string | null) => {
    const loja = lojas.find((l) => l.id === unitId)
    setArrastando(null)
    setAlvo(undefined)
    // Soltar na mesma coluna não é mudança — não gasta ida ao servidor.
    if (!loja || (loja.etapaId ?? null) === etapaId) return
    const fd = new FormData()
    fd.set("unitId", unitId)
    fd.set("etapaId", etapaId ?? "")
    iniciar(async () => {
      await moverParaEtapa(INICIAL, fd)
      router.refresh()
    })
  }

  /* Ordena pelo tempo de espera, não pelo código. Quem espera há mais tempo é
     quem a tela precisa mostrar primeiro — é o cliente que já paga e ainda
     não foi atendido. */
  const ordenadas = [...lojas].sort(
    (a, b) => (b.diasDesdeVenda ?? -1) - (a.diasDesdeVenda ?? -1),
  )
  const colunas = [
    { id: null as string | null, nome: "Sem etapa", conclui: false },
    ...etapas,
  ]
  const aberta = lojas.find((l) => l.id === ficha) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div data-tour="onb-acoes" className="flex flex-wrap items-center gap-2">
        <AdicionarLoja livres={livres} />
        <NovaColuna />
        <Button size="sm" variant="ghost" onClick={() => setGerindo((g) => !g)}>
          <Settings2 className="size-3.5" />
          {gerindo ? "Concluir edição" : "Editar colunas"}
        </Button>
        <NovoVendedor />
        <span className="text-[11px] text-muted-foreground">
          {pendente ? "Movendo…" : "Arraste o cartão entre as colunas."}
        </span>
      </div>

      {/* Rola DENTRO do quadro, não na página: coluna é criada pelo cliente,
          então cinco vira oito e a largura deixa de caber. Sem isto a página
          inteira ganha rolagem horizontal e o menu sai de vista. */}
      {/* `min-w-0` NÃO É DECORAÇÃO AQUI.
          Item de flex tem `min-width: auto` por padrão, então ele cresce até
          caber o conteúdo em vez de deixar o `overflow-x-auto` agir — e a
          rolagem vaza pro <main>, levando junto o cabeçalho e o menu. Medido:
          main com 1402px numa janela de 1181px. */}
      <div data-tour="onb-quadro" className="-mx-1 min-w-0 overflow-x-auto px-1 pb-2">
        {/* `w-max` e NÃO `minWidth` em pixels.
            Largura mínima em px sobe a árvore: o <main> tem `min-width: auto`
            e cresce pra caber o filho, então a rolagem que era pra ficar no
            quadro ia parar na página inteira (main com 1146px numa área de
            925px, arrastando cabeçalho e menu junto). `w-max` mede o conteúdo
            DENTRO do contêiner que rola e para ali. */}
        <div
          className="grid w-max gap-3"
          style={{ gridTemplateColumns: `repeat(${colunas.length}, 210px)` }}
        >
          {colunas.map((c) => {
            const dela = ordenadas.filter((l) => (l.etapaId ?? null) === c.id)
            return (
              <div
                key={c.id ?? "sem"}
                onDragOver={(e) => {
                  // Sem preventDefault o navegador recusa a soltura.
                  e.preventDefault()
                  setAlvo(c.id)
                }}
                onDragLeave={() => setAlvo((a) => (a === c.id ? undefined : a))}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData("text/plain")
                  if (id) soltar(id, c.id)
                }}
                className={`flex min-w-0 flex-col gap-2 rounded-lg p-1 transition-colors ${
                  arrastando && alvo === c.id
                    ? "bg-primary/10 ring-1 ring-primary/40"
                    : arrastando
                      ? "bg-muted/40"
                      : ""
                }`}
              >
              <div className="flex items-center gap-1.5 border-b pb-1.5">
                <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {c.nome}
                  {c.conclui && (
                    <span className="ml-1 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                      · conclui
                    </span>
                  )}
                </h2>
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums">
                  {dela.length}
                </span>
              </div>

              {gerindo && c.id && <EditarColuna etapa={c as Etapa} />}

              {dela.length === 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">—</p>
              ) : (
                dela.map((l) => (
                  <Cartao
                    key={l.id}
                    l={l}
                    etapas={etapas}
                    onAbrir={() => setFicha(l.id)}
                    arrastando={arrastando === l.id}
                    onArrastar={setArrastando}
                  />
                ))
              )}
              </div>
            )
          })}
        </div>
      </div>

      {lojas.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma loja no quadro. Use “Adicionar loja” acima, ou cadastre uma
          loja nova — ela entra aqui sozinha.
        </div>
      )}

      {aberta && (
        <Ficha
          l={aberta}
          etapas={etapas}
          vendedores={vendedores}
          fechar={() => setFicha(null)}
        />
      )}
    </div>
  )
}

/* ── O CARTÃO ─────────────────────────────────────────────────────────── */

function Cartao({
  l,
  etapas,
  onAbrir,
  arrastando,
  onArrastar,
}: {
  l: LojaOnboarding
  etapas: Etapa[]
  onAbrir: () => void
  arrastando: boolean
  onArrastar: (id: string | null) => void
}) {
  /* Mais de 15 dias entre vender e atender é onde o cliente novo desiste —
     ele já pagou e ainda não viu nada acontecer. */
  const atrasada = (l.diasDesdeVenda ?? 0) > 15 && !l.concluida

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", l.id)
        e.dataTransfer.effectAllowed = "move"
        onArrastar(l.id)
      }}
      onDragEnd={() => onArrastar(null)}
      className={`cursor-grab rounded-xl border bg-card p-2.5 active:cursor-grabbing ${
        atrasada ? "border-amber-400 dark:border-amber-700" : ""
      } ${arrastando ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-start gap-2 text-left"
      >
        {l.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.logoUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
            {l.code}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{l.nome}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {l.vendedorNome ?? "sem vendedor"}
            {l.diasDesdeVenda !== null && ` · há ${l.diasDesdeVenda}d`}
          </span>
          {l.sucessoResponsavel && (
            <span className="block truncate text-[11px] text-muted-foreground">
              sucesso: {l.sucessoResponsavel}
            </span>
          )}
          {atrasada && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3" /> esperando há {l.diasDesdeVenda}d
            </span>
          )}
        </span>
      </button>
      {/* O seletor fica: arrastar não funciona no teclado nem é confortável
          no celular, e mover de coluna não pode depender do mouse. */}
      <Mover unitId={l.id} atual={l.etapaId} etapas={etapas} />
    </div>
  )
}

/** Mover de coluna por seletor — o arrasto do quadro, sem arrastar. */
function Mover({
  unitId,
  atual,
  etapas,
}: {
  unitId: string
  atual: string | null
  etapas: Etapa[]
}) {
  const [state, action] = useActionState(moverParaEtapa, INICIAL)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form ref={ref} action={action} className="mt-1.5">
      <input type="hidden" name="unitId" value={unitId} />
      <select
        name="etapaId"
        defaultValue={atual ?? ""}
        onChange={() => ref.current?.requestSubmit()}
        className="h-7 w-full rounded-md border bg-background px-1.5 text-[11px] outline-none focus:border-ring"
      >
        <option value="">Sem etapa</option>
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
    </form>
  )
}

/* ── A FICHA (o modal) ────────────────────────────────────────────────── */

/**
 * A ficha de onboarding, como no painel de origem.
 *
 * Um modal e não a expansão do cartão: os campos são muitos e, dentro da
 * coluna, o formulário empurra o resto do quadro pra baixo — quem estava
 * comparando duas colunas perde a comparação ao abrir uma loja.
 */
function Ficha({
  l,
  etapas,
  vendedores,
  fechar,
}: {
  l: LojaOnboarding
  etapas: Etapa[]
  vendedores: Vendedor[]
  fechar: () => void
}) {
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [fechar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={fechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border bg-card shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
            Onboarding · {l.nome}
          </h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* Resumo em leitura, como na ficha deles: o que já se sabe da loja
            antes de qualquer campo editável. */}
        <div className="grid gap-x-6 gap-y-3 border-b bg-muted/30 px-5 py-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <Dado rotulo="Loja" valor={l.nome} />
          <Dado rotulo="Código / cidade" valor={`#${l.code}${l.cidade ? ` · ${l.cidade}` : ""}`} />
          <Dado rotulo="Comercial" valor={l.vendedorNome ?? "—"} />
          <Dado
            rotulo="Promessa"
            valor={l.promessa ?? "Não"}
            destaque={!!l.promessa}
          />
          <Dado
            rotulo="Etapa atual"
            valor={l.etapaNome ?? "Sem etapa"}
            selo
          />
          <Dado rotulo="Gestor definido" valor={l.gestorNome ?? "Não definido"} />
          <Dado
            rotulo="Mensalidade"
            valor={l.mensalidade === null ? "—" : fmtBRL(l.mensalidade)}
          />
          <Dado
            rotulo="Vendida em"
            valor={
              l.dataVenda
                ? new Date(`${l.dataVenda}T12:00:00Z`).toLocaleDateString("pt-BR")
                : "—"
            }
          />
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <FormOnboarding l={l} etapas={etapas} />
          <div className="flex flex-col gap-5">
            <FormVenda l={l} vendedores={vendedores} />
            <Encaminhamento l={l} />
          </div>
        </div>

        <footer className="flex justify-end border-t px-5 py-3">
          <Button size="sm" variant="ghost" onClick={fechar}>
            Fechar
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Dado({
  rotulo,
  valor,
  destaque,
  selo,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
  selo?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      {selo ? (
        <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
          {valor}
        </span>
      ) : (
        <span
          className={`truncate text-sm ${destaque ? "font-medium" : ""}`}
          title={valor}
        >
          {valor}
        </span>
      )}
    </div>
  )
}

function FormVenda({
  l,
  vendedores,
}: {
  l: LojaOnboarding
  vendedores: Vendedor[]
}) {
  const [state, action] = useActionState(salvarVenda, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="unitId" value={l.id} />
      <Titulo>A venda</Titulo>
      <Campo rotulo="Comercial">
        <SeletorBusca
          name="vendedorId"
          opcoes={vendedores.map((v) => ({ id: v.id, rotulo: v.nome }))}
          valorInicial={l.vendedorId ?? ""}
          placeholder="Sem vendedor"
          vazio="Sem vendedor"
        />
      </Campo>
      <Campo rotulo="Data da venda">
        <input
          type="date"
          name="dataVenda"
          defaultValue={l.dataVenda ?? ""}
          className={ENTRADA}
        />
      </Campo>
      <Campo rotulo="Mensalidade da agência (R$)">
        <input
          name="mensalidade"
          inputMode="decimal"
          defaultValue={l.mensalidade === null ? "" : String(l.mensalidade).replace(".", ",")}
          placeholder="ex.: 990,00"
          className={ENTRADA}
        />
      </Campo>
      {state.error && <Erro>{state.error}</Erro>}
      <div>
        <Enviar rotulo="Salvar venda" />
      </div>
    </form>
  )
}

function FormOnboarding({ l, etapas }: { l: LojaOnboarding; etapas: Etapa[] }) {
  const [state, action] = useActionState(salvarOnboarding, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="unitId" value={l.id} />
      <Titulo>O onboarding</Titulo>
      <Campo rotulo="Responsável de sucesso">
        <input
          name="responsavel"
          defaultValue={l.sucessoResponsavel ?? ""}
          placeholder="quem alinha com o lojista"
          className={ENTRADA}
        />
      </Campo>
      <Campo rotulo="Etapa">
        <select name="etapaId" defaultValue={l.etapaId ?? ""} className={ENTRADA}>
          <option value="">Sem etapa</option>
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Data e hora da reunião">
        <input
          type="datetime-local"
          name="reuniao"
          defaultValue={paraInput(l.reuniaoEm)}
          className={ENTRADA}
        />
      </Campo>
      <Campo rotulo="Link da reunião">
        <input
          name="link"
          type="url"
          defaultValue={l.link ?? ""}
          placeholder="https://meet.google.com/…"
          className={ENTRADA}
        />
      </Campo>
      <Campo rotulo="Observações">
        <textarea
          name="observacoes"
          rows={4}
          defaultValue={l.observacoes ?? ""}
          placeholder="Notas do alinhamento"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
        />
      </Campo>
      {/* ⚠️ ESCRITO NA TELA, NÃO SÓ NO CÓDIGO.
          O painel de origem usava este campo pra guardar usuário e senha das
          plataformas do cliente. Senha de terceiro em texto livre vaza junto
          com qualquer consulta — e ela abre o iFood do lojista, não este
          sistema. Se não avisar aqui, alguém vai colar. */}
      <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Não guarde usuário e senha aqui. Este campo é texto comum e aparece pra
        qualquer pessoa com acesso à tela.
      </p>
      {state.error && <Erro>{state.error}</Erro>}
      <div className="flex items-center gap-3">
        <Enviar rotulo="Salvar alterações" />
        {l.link && (
          <a
            href={l.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" /> abrir reunião
          </a>
        )}
      </div>
    </form>
  )
}

/**
 * A passagem pro gestor.
 *
 * NÃO duplica o botão de encaminhar: ele vive na aba Carteira da loja, com a
 * regra (checklist + cardápio) já provada no servidor. Duplicar a ação seria
 * duplicar a regra — e o modo de falha campeão deste projeto é a cópia que
 * não recebeu a regra do original.
 */
function Encaminhamento({ l }: { l: LojaOnboarding }) {
  const pronta = l.checklistOk && l.cardapioOk && l.concluida
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
      <Titulo>Encaminhar para gestor</Titulo>
      <p className="text-[11px] text-muted-foreground">
        Checklist {l.checklistOk ? "ok" : "pendente"} · Cardápio{" "}
        {l.cardapioOk ? "ok" : "pendente"} · Onboarding{" "}
        {l.concluida ? "concluído" : "em andamento"}
        {l.gestorNome && ` · gestor: ${l.gestorNome}`}
      </p>
      {pronta || l.encaminhada ? (
        <Link
          href={`/unidades/${encodeURIComponent(l.code)}`}
          className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          {l.encaminhada ? "Ver na carteira →" : "Encaminhar na aba Carteira →"}
        </Link>
      ) : (
        <p className="rounded-md bg-muted px-2 py-1.5 text-center text-[11px] text-muted-foreground">
          Disponível ao concluir o onboarding
        </p>
      )}
    </div>
  )
}

/* ── COLUNAS E CARDS ──────────────────────────────────────────────────── */

function AdicionarLoja({ livres }: { livres: LojaLivre[] }) {
  if (livres.length === 0) return null
  return (
    <Popover acao={adicionarAoQuadro} rotulo="Adicionar loja" icone={<Plus className="size-3.5" />}>
      <Campo rotulo="Loja">
        <SeletorBusca
          name="unitId"
          opcoes={livres.map((l) => ({ id: l.id, rotulo: l.nome, detalhe: l.code }))}
          placeholder="Escolha a loja…"
          vazio={null}
          obrigatorio
        />
      </Campo>
    </Popover>
  )
}

function NovaColuna() {
  return (
    <Popover acao={criarEtapa} rotulo="Nova coluna" icone={<Plus className="size-3.5" />}>
      <Campo rotulo="Nome da coluna">
        <input name="nome" required placeholder="ex.: Aguardando contrato" className={ENTRADA} />
      </Campo>
    </Popover>
  )
}

function EditarColuna({ etapa }: { etapa: Etapa }) {
  const [state, action] = useActionState(editarEtapa, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-2">
      <input type="hidden" name="id" value={etapa.id} />
      <div className="flex items-center gap-1">
        <GripVertical className="size-3 shrink-0 text-muted-foreground" />
        <input
          name="nome"
          defaultValue={etapa.nome}
          className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-[11px] outline-none focus:border-ring"
        />
        <input
          name="ordem"
          type="number"
          defaultValue={etapa.ordem}
          title="Ordem da coluna"
          className="h-7 w-12 rounded border bg-background px-1 text-[11px] tabular-nums outline-none focus:border-ring"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="submit"
          name="acao"
          value="editar"
          className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-background"
        >
          salvar
        </button>
        {!etapa.conclui && (
          <button
            type="submit"
            name="acao"
            value="conclui"
            title="Marcar como a etapa que conclui o onboarding"
            className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-background"
          >
            marcar como final
          </button>
        )}
        {/* Excluir não apaga loja: as lojas voltam pra "Sem etapa". */}
        <button
          type="submit"
          name="acao"
          value="excluir"
          className="ml-auto rounded border px-1.5 py-0.5 text-[10px] text-rose-600 hover:bg-background"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {state.error && <Erro>{state.error}</Erro>}
    </form>
  )
}

function NovoVendedor() {
  return (
    <Popover acao={criarVendedor} rotulo="Novo vendedor" icone={<Plus className="size-3.5" />} discreto>
      <Campo rotulo="Nome do vendedor">
        <input name="nome" required placeholder="quem fecha a venda" className={ENTRADA} />
      </Campo>
    </Popover>
  )
}

/* ── PEÇAS ────────────────────────────────────────────────────────────── */

const ENTRADA =
  "h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"

function Popover({
  acao,
  rotulo,
  icone,
  discreto,
  children,
}: {
  acao: (p: OnboardingState, f: FormData) => Promise<OnboardingState>
  rotulo: string
  icone: React.ReactNode
  discreto?: boolean
  children: React.ReactNode
}) {
  const [state, action] = useActionState(acao, INICIAL)
  const [aberto, setAberto] = React.useState(false)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset()
      setAberto(false)
      router.refresh()
    }
  }, [state.ok, router])

  return (
    <div className="relative">
      <Button
        size="sm"
        variant={discreto ? "ghost" : "outline"}
        onClick={() => setAberto((a) => !a)}
      >
        {icone} {rotulo}
      </Button>
      {aberto && (
        <form
          ref={ref}
          action={action}
          className="absolute left-0 top-full z-40 mt-1 flex w-72 flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl"
        >
          {children}
          {state.error && <Erro>{state.error}</Erro>}
          <div className="flex gap-2">
            <Enviar rotulo="Salvar" />
            <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  )
}

function Erro({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-rose-600">{children}</p>
}

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Button>
  )
}
