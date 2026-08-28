"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, ExternalLink, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  STATUS,
  type LojaOnboarding,
} from "@/lib/data/carteira-onboarding-tipos"

import {
  criarVendedor,
  salvarOnboarding,
  salvarVenda,
  type OnboardingState,
} from "../_actions"

export type Vendedor = { id: string; nome: string }

const INICIAL: OnboardingState = { ok: false }

/** ISO → "2026-08-28T14:30", que é o que o input datetime-local aceita. */
function paraInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function OnboardingView({
  lojas,
  vendedores,
}: {
  lojas: LojaOnboarding[]
  vendedores: Vendedor[]
}) {
  const [aberta, setAberta] = React.useState<string | null>(null)

  const colunas = [
    { id: null, titulo: "Sem status", ajuda: "vendida e ainda não tocada" },
    ...STATUS.map((s) => ({ id: s.id as string | null, titulo: s.label, ajuda: "" })),
  ]

  /* Ordena pelo tempo de espera, não pelo código. Quem está esperando há mais
     tempo é quem a tela precisa mostrar primeiro — é o cliente que já paga e
     ainda não foi atendido. */
  const ordenadas = [...lojas].sort(
    (a, b) => (b.diasDesdeVenda ?? -1) - (a.diasDesdeVenda ?? -1),
  )

  return (
    <div className="flex flex-col gap-4">
      <NovoVendedor />

      {lojas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma loja na fila. Loja entra aqui quando está na categoria
          &quot;Novas&quot; ou quando alguém começa um onboarding nela.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          {colunas.map((c) => {
            const dela = ordenadas.filter((l) => (l.status ?? null) === c.id)
            return (
              <div key={c.titulo} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 border-b pb-1.5">
                  <h2 className="text-xs font-semibold">{c.titulo}</h2>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums">
                    {dela.length}
                  </span>
                </div>
                {dela.length === 0 ? (
                  <p className="px-1 text-[11px] text-muted-foreground">—</p>
                ) : (
                  dela.map((l) => (
                    <Cartao
                      key={l.id}
                      l={l}
                      vendedores={vendedores}
                      aberta={aberta === l.id}
                      abrir={() => setAberta(aberta === l.id ? null : l.id)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Cartao({
  l,
  vendedores,
  aberta,
  abrir,
}: {
  l: LojaOnboarding
  vendedores: Vendedor[]
  aberta: boolean
  abrir: () => void
}) {
  /* Mais de 15 dias entre vender e atender é onde o cliente novo desiste —
     ele já pagou e ainda não viu nada acontecer. */
  const atrasada = (l.diasDesdeVenda ?? 0) > 15 && l.status !== "concluido"

  return (
    <div
      className={`rounded-xl border bg-card p-3 ${atrasada ? "border-amber-400 dark:border-amber-700" : ""}`}
    >
      <button
        type="button"
        onClick={abrir}
        className="flex w-full flex-col gap-1 text-left"
      >
        <span className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {l.nome}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            #{l.code}
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground">
          {l.vendedorNome ?? "sem vendedor"}
          {l.diasDesdeVenda !== null && ` · há ${l.diasDesdeVenda}d`}
        </span>
        {l.sucessoResponsavel && (
          <span className="text-[11px] text-muted-foreground">
            sucesso: {l.sucessoResponsavel}
          </span>
        )}
        {atrasada && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3" /> esperando há {l.diasDesdeVenda}{" "}
            dias
          </span>
        )}
        {l.reuniaoEm && (
          <span className="text-[11px] text-muted-foreground">
            reunião{" "}
            {new Date(l.reuniaoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </button>

      {aberta && (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3">
          <FormVenda l={l} vendedores={vendedores} />
          <FormOnboarding l={l} />
          <Encaminhamento l={l} />
        </div>
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
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="unitId" value={l.id} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        A venda
      </p>
      <select
        name="vendedorId"
        defaultValue={vendedores.find((v) => v.nome === l.vendedorNome)?.id ?? ""}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      >
        <option value="">Sem vendedor</option>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nome}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="dataVenda"
        defaultValue={l.dataVenda ?? ""}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">
          Mensalidade da agência (R$)
        </span>
        <input
          name="mensalidade"
          inputMode="decimal"
          placeholder="ex.: 990,00"
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        />
      </label>
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
      <Enviar rotulo="Salvar venda" />
    </form>
  )
}

function FormOnboarding({ l }: { l: LojaOnboarding }) {
  const [state, action] = useActionState(salvarOnboarding, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="unitId" value={l.id} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        O onboarding
      </p>
      <input
        name="responsavel"
        defaultValue={l.sucessoResponsavel ?? ""}
        placeholder="Responsável de sucesso"
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      <select
        name="status"
        defaultValue={l.status ?? ""}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      >
        <option value="">Sem status</option>
        {STATUS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        name="reuniao"
        defaultValue={paraInput(l.reuniaoEm)}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      <input
        name="link"
        type="url"
        defaultValue={l.link ?? ""}
        placeholder="Link da reunião (https://)"
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      <textarea
        name="observacoes"
        rows={3}
        defaultValue={l.observacoes ?? ""}
        placeholder="Observações do alinhamento"
        className="rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
      />
      {/* ⚠️ ESCRITO NA TELA, NÃO SÓ NO CÓDIGO.
          O painel de origem usava este campo pra guardar usuário e senha das
          plataformas do cliente. Senha de terceiro em texto livre vaza junto
          com qualquer consulta — e ela abre o iFood do lojista, não este
          sistema. Se não avisar aqui, alguém vai colar. */}
      <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Não guarde usuário e senha aqui. Este campo é texto comum e aparece pra
        qualquer pessoa com acesso à tela.
      </p>
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Enviar rotulo="Salvar" />
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
  const pronta = l.checklistOk && l.cardapioOk
  return (
    <div className="flex flex-col gap-1 border-t pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Passagem pro gestor
      </p>
      <p className="text-[11px] text-muted-foreground">
        Checklist {l.checklistOk ? "ok" : "pendente"} · Cardápio{" "}
        {l.cardapioOk ? "ok" : "pendente"}
        {l.gestorNome && ` · gestor: ${l.gestorNome}`}
      </p>
      <Link
        href={`/unidades/${encodeURIComponent(l.code)}`}
        className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        {l.encaminhada
          ? "Ver na carteira"
          : pronta
            ? "Encaminhar na aba Carteira →"
            : "Concluir checklist e cardápio →"}
      </Link>
    </div>
  )
}

function NovoVendedor() {
  const [state, action] = useActionState(criarVendedor, INICIAL)
  const [mostrar, setMostrar] = React.useState(false)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset()
      setMostrar(false)
      router.refresh()
    }
  }, [state.ok, router])

  if (!mostrar) {
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setMostrar(true)}>
          <Plus className="size-3.5" /> Novo vendedor
        </Button>
      </div>
    )
  }
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="nome"
        required
        placeholder="Nome do vendedor"
        className="h-9 min-w-[180px] rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring"
      />
      <Enviar rotulo="Criar" />
      <Button type="button" size="sm" variant="ghost" onClick={() => setMostrar(false)}>
        Cancelar
      </Button>
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
    </form>
  )
}

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Button>
  )
}
