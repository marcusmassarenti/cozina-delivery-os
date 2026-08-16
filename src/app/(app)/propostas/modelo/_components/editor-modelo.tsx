"use client"

/**
 * Edição do MODELO da proposta — os textos que valem pra toda proposta nova.
 *
 * ⚠️ MUDAR AQUI MUDA AS PROPOSTAS JÁ EMITIDAS, inclusive as enviadas: o PDF é
 * montado na hora de abrir, lendo o modelo atual. É o comportamento certo pra
 * texto padrão (corrigir uma frase errada precisa valer pra todo mundo), mas é
 * surpreendente o bastante pra estar escrito na tela, e não só aqui.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ItemEscopo, ModeloProposta } from "@/lib/data/proposta-modelo"
import { salvarModeloProposta } from "../_actions"

const PLANOS = [
  { id: "essencial" as const, label: "Essencial" },
  { id: "pro" as const, label: "Pro" },
  { id: "ai" as const, label: "AI" },
]

export function EditorModelo({
  inicial,
  padrao,
}: {
  inicial: ModeloProposta
  /** Texto de fábrica, pro botão "voltar ao padrão" de cada campo. */
  padrao: ModeloProposta
}) {
  const router = useRouter()
  const [m, setM] = React.useState<ModeloProposta>(inicial)
  const [salvando, setSalvando] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  function set<K extends keyof ModeloProposta>(k: K, v: ModeloProposta[K]) {
    setM((p) => ({ ...p, [k]: v }))
    setMsg(null)
  }

  const salvar = async () => {
    setSalvando(true)
    const r = await salvarModeloProposta(m)
    setSalvando(false)
    setMsg(r.ok ? "Modelo salvo." : (r.message ?? "Erro ao salvar."))
    if (r.ok) router.refresh()
  }

  const setItem = (i: number, patch: Partial<ItemEscopo>) =>
    set(
      "escopoItens",
      m.escopoItens.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        O que você escrever aqui vale para <strong>todas as propostas</strong> —
        inclusive as que já foram enviadas, porque o PDF é montado na hora de
        abrir. Deixe um campo em branco para voltar ao texto padrão do sistema.
      </div>

      {/* ── Capa e apresentação ────────────────────────────────────── */}
      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Capa e apresentação</h2>
        <Campo
          rot="Título da capa"
          ajuda="A frase grande. Hoje é a mesma da tela de login — quem recebe a proposta e depois entra no sistema encontra a mesma promessa."
          v={m.capaTitulo}
          padrao={padrao.capaTitulo}
          onChange={(v) => set("capaTitulo", v)}
          linhas={2}
        />
        <Campo
          rot="Subtítulo da capa"
          v={m.capaSubtitulo}
          padrao={padrao.capaSubtitulo}
          onChange={(v) => set("capaSubtitulo", v)}
          linhas={2}
        />
        <Campo
          rot="Quem somos"
          ajuda="Separe os parágrafos com uma linha em branco."
          v={m.historia}
          padrao={padrao.historia}
          onChange={(v) => set("historia", v)}
          linhas={9}
        />
      </section>

      {/* ── O que muda pra quem usa ────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">O que muda pra quem usa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Blocos por perfil de pessoa. Saem em duas colunas na proposta.
        </p>
        <div className="mt-3 space-y-3">
          {m.ajudamos.map((b, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <input
                  value={b.titulo}
                  onChange={(e) =>
                    set(
                      "ajudamos",
                      m.ajudamos.map((x, idx) =>
                        idx === i ? { ...x, titulo: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Quem é (ex.: O dono da rede)"
                  className="h-8 w-full rounded-md border bg-background px-2 text-sm font-medium outline-none focus:border-ring"
                />
                <textarea
                  value={b.texto}
                  onChange={(e) =>
                    set(
                      "ajudamos",
                      m.ajudamos.map((x, idx) =>
                        idx === i ? { ...x, texto: e.target.value } : x,
                      ),
                    )
                  }
                  rows={2}
                  placeholder="O que muda pra essa pessoa"
                  className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  set("ajudamos", m.ajudamos.filter((_, idx) => idx !== i))
                }
                className="h-8 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remover bloco"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => set("ajudamos", [...m.ajudamos, { titulo: "", texto: "" }])}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
        >
          <Plus className="size-3.5" />
          Adicionar bloco
        </button>
      </section>

      {/* ── Escopo ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Escopo — o que entra em cada plano</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta lista aparece na proposta com ✓ ou – conforme o plano do cliente.
          O que fica de fora é tão importante quanto o que entra: é o que evita
          a discussão de &quot;achei que tinha isso&quot;.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left font-semibold">Recurso</th>
                {PLANOS.map((p) => (
                  <th key={p.id} className="w-[90px] py-2 text-center font-semibold">
                    {p.label}
                  </th>
                ))}
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {m.escopoItens.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">
                    <input
                      value={item.recurso}
                      onChange={(e) => setItem(i, { recurso: e.target.value })}
                      className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring"
                    />
                  </td>
                  {PLANOS.map((p) => (
                    <td key={p.id} className="py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={item.planos.includes(p.id)}
                        onChange={(e) =>
                          setItem(i, {
                            planos: e.target.checked
                              ? [...item.planos, p.id]
                              : item.planos.filter((x) => x !== p.id),
                          })
                        }
                        className="size-4 rounded border-border"
                      />
                    </td>
                  ))}
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "escopoItens",
                          m.escopoItens.filter((_, idx) => idx !== i),
                        )
                      }
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Remover recurso"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() =>
            set("escopoItens", [...m.escopoItens, { recurso: "", planos: [] }])
          }
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
        >
          <Plus className="size-3.5" />
          Adicionar recurso
        </button>
      </section>

      {/* ── Textos ─────────────────────────────────────────────────── */}
      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <Campo
          rot="Termo de aceite"
          ajuda="O parágrafo que transforma a proposta em compromisso. Aparece no quadro final, acima da assinatura."
          v={m.termoAceite}
          padrao={padrao.termoAceite}
          onChange={(v) => set("termoAceite", v)}
          linhas={4}
        />
        <Campo
          rot="Endereço do contrato"
          ajuda="A proposta diz que obedece a este contrato e é parte dele."
          v={m.contratoUrl}
          padrao={padrao.contratoUrl}
          onChange={(v) => set("contratoUrl", v)}
          linhas={1}
        />
        <Campo
          rot="Faturamento"
          ajuda="Quando começa a cobrar, quando vence e como se paga."
          v={m.faturamento}
          padrao={padrao.faturamento}
          onChange={(v) => set("faturamento", v)}
          linhas={3}
        />
        <Campo
          rot="Atendimento"
          ajuda="Canais e horários. É o que o cliente lê pra saber o que esperar."
          v={m.atendimento}
          padrao={padrao.atendimento}
          onChange={(v) => set("atendimento", v)}
          linhas={3}
        />
        <Campo
          rot="Novas lojas"
          ajuda="Como funciona incluir loja depois de assinado — no seu preço, isso acontece o tempo todo."
          v={m.contratarMais}
          padrao={padrao.contratarMais}
          onChange={(v) => set("contratarMais", v)}
          linhas={3}
        />
        <Campo
          rot="Prazo do treinamento"
          v={m.treinamentoPrazo}
          padrao={padrao.treinamentoPrazo}
          onChange={(v) => set("treinamentoPrazo", v)}
          linhas={2}
        />
        <Campo
          rot="Rodapé de valores"
          ajuda="Protege contra 'não usei, não pago' e contra o número mudar sem documento novo."
          v={m.rodapeValores}
          padrao={padrao.rodapeValores}
          onChange={(v) => set("rodapeValores", v)}
          linhas={3}
        />
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Salvar modelo
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  )
}

function Campo({
  rot,
  ajuda,
  v,
  padrao,
  onChange,
  linhas,
}: {
  rot: string
  ajuda?: string
  v: string
  padrao: string
  onChange: (v: string) => void
  linhas: number
}) {
  const alterado = v.trim() !== padrao.trim()
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{rot}</label>
        {alterado && (
          <button
            type="button"
            onClick={() => onChange(padrao)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            voltar ao padrão
          </button>
        )}
      </div>
      {ajuda && <p className="mt-0.5 text-xs text-muted-foreground">{ajuda}</p>}
      <textarea
        value={v}
        onChange={(e) => onChange(e.target.value)}
        rows={linhas}
        className="mt-1.5 w-full rounded-md border bg-background p-2 text-sm outline-none focus:border-ring"
      />
    </div>
  )
}
