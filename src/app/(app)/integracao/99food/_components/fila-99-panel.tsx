"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Copy, Link2, RefreshCw } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"

import {
  atualizarSolicitacao99,
  avisarClienteAutorizar99,
  verificarLojas99,
  vincularLoja99,
  type Solicitacao99State,
  type Verificacao99,
} from "../_actions"

export type Solicitacao99 = {
  id: string
  cnpj: string
  loja99: string | null
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  nota: string | null
  holdingName: string
  unitLabel: string | null
  createdAt: string
  /** Quando o lojista clicou em "Já autorizei" no aviso da tela dele. */
  clienteConfirmouEm: string | null
}

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}

function Botao({ rotulo, variante }: { rotulo: string; variante?: "default" }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant={variante ?? "outline"}
      disabled={pending}
    >
      {pending ? "..." : rotulo}
    </Button>
  )
}

/** Copiar o CNPJ com um clique — é o que se cola no contato com o 99. */
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
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-xs hover:bg-muted"
      title="Copiar CNPJ"
    >
      {fmtCnpj(cnpj)}
      {copiado ? (
        <Check className="size-3 text-emerald-600" />
      ) : (
        <Copy className="size-3 text-muted-foreground" />
      )}
    </button>
  )
}

const ROTULO: Record<Solicitacao99["status"], { txt: string; cls: string }> = {
  pendente: {
    txt: "Cliente pediu",
    cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400",
  },
  solicitada: {
    txt: "Pedido ao 99",
    cls: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400",
  },
  ativa: {
    txt: "Vinculada",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400",
  },
  recusada: {
    txt: "Recusada",
    cls: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400",
  },
}

export function Fila99Panel({ itens }: { itens: Solicitacao99[] }) {
  const [statusState, statusAction] = useActionState<
    Solicitacao99State,
    FormData
  >(atualizarSolicitacao99, { ok: false })
  const [vincState, vincAction] = useActionState<Solicitacao99State, FormData>(
    vincularLoja99,
    { ok: false },
  )
  const [avisoState, avisarAction] = useActionState<Solicitacao99State, FormData>(
    avisarClienteAutorizar99,
    { ok: false },
  )
  const aviso = vincState.error ?? statusState.error ?? avisoState.error
  const sucesso = vincState.message ?? statusState.message ?? avisoState.message

  if (itens.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm font-medium">Nenhuma solicitação na fila</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando um cliente pedir a conexão do 99 pela tela da unidade, ela
          aparece aqui — e você recebe um e-mail.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          {aviso}
        </p>
      )}
      {sucesso && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
          {sucesso}
        </p>
      )}

      <VerificarNo99 />

      {itens.map((s) => (
        <div key={s.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.holdingName}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROTULO[s.status].cls}`}
                >
                  {ROTULO[s.status].txt}
                </span>
              </div>
              {/* O cliente avisou que autorizou: é a NOSSA vez. Sem este selo
                  o carimbo cairia no vazio e ele ficaria esperando de novo. */}
              {s.clienteConfirmouEm && s.status !== "ativa" && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                  Cliente diz que autorizou em{" "}
                  {new Date(s.clienteConfirmouEm).toLocaleDateString("pt-BR")}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.unitLabel ?? "sem unidade"} · <CopiarCnpj cnpj={s.cnpj} />
                {s.loja99 ? ` · "${s.loja99}"` : ""}
              </p>
              {s.nota && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {s.nota}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {new Date(s.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {s.status === "pendente" && (
              <form action={statusAction} className="contents">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value="solicitada" />
                <Botao rotulo="Pedi a autorização ao 99" />
              </form>
            )}

            {/* Quando a loja não aparece no portal, a conclusão é uma só: o
                lojista não autorizou. Este botão manda o e-mail E acende a
                faixa na tela de Início dele — um canal só não basta.
                
                CONTINUA DEPOIS DE CLICADO, e é de propósito: avisar uma vez não
                garante que a pessoa fez. O que muda é o peso — vira "de novo",
                em tom secundário, pra não parecer ação pendente nem sugerir que
                o clique anterior não funcionou. Quem confirma que o aviso saiu
                é o selo "Pedido ao 99" no topo do card. */}
            {s.status !== "ativa" && s.status !== "recusada" && (
              <form action={avisarAction} className="contents">
                <input type="hidden" name="id" value={s.id} />
                <Botao
                  rotulo={
                    s.status === "solicitada"
                      ? "Avisar de novo"
                      : "Avisar cliente pra autorizar"
                  }
                  variante={s.status === "solicitada" ? undefined : "default"}
                />
              </form>
            )}

            {/* Vincular aparece já no "pendente" porque o 99 às vezes devolve o
                app_shop_id na mesma conversa — obrigar a passar pelo status
                intermediário só criaria um clique a mais sem informação nova. */}
            {s.status !== "ativa" && (
              <form
                action={vincAction}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={s.id} />
                <input
                  name="app_shop_id"
                  placeholder="app_shop_id do 99"
                  className="h-8 w-48 rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="submit" size="sm">
                  <Link2 className="size-3.5" />
                  Vincular loja
                </Button>
              </form>
            )}

            {s.status !== "recusada" && s.status !== "ativa" && (
              <form
                action={statusAction}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value="recusada" />
                <input
                  name="nota"
                  placeholder="Motivo (o cliente lê)"
                  className="h-8 w-56 rounded-md border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
                <Botao rotulo="Recusar" />
              </form>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * "O cliente já autorizou?" — perguntado AO 99, não ao cliente.
 *
 * O `app_shop_id` era digitado à mão num campo livre, e os slugs do 99 se
 * parecem entre lojas do mesmo cliente ("dg-acaiepastelaria-01" vs
 * "dg-donnatatta-01"). Errar a colagem aponta o financeiro de uma loja pra
 * outra, e o sistema só reclama se o id já tiver dono.
 *
 * A lista aqui já vem filtrada pelo que NÃO tem unidade — é o conjunto de onde
 * a resposta pode sair. Clicar copia o id pro campo certo em vez de digitar.
 */
function VerificarNo99() {
  const [r, setR] = React.useState<Verificacao99 | null>(null)
  const [carregando, setCarregando] = React.useState(false)

  async function verificar() {
    setCarregando(true)
    try {
      setR(await verificarLojas99())
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={verificar} disabled={carregando}>
          <RefreshCw className={`size-3.5 ${carregando ? "animate-spin" : ""}`} />
          {carregando ? "Perguntando ao 99..." : "Verificar quem já autorizou"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Consulta o portal do 99 e mostra as lojas autorizadas que ainda não
          têm unidade. Uma consulta a cada 20 segundos.
        </span>
      </div>

      {r?.error && (
        <p className="mt-2 text-xs text-destructive">{r.error}</p>
      )}
      {r?.ok && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{r.message}</p>
          {(r.livres ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(r.livres ?? []).map((l) => (
                <button
                  key={l.appShopId}
                  type="button"
                  onClick={() => {
                    // Preenche TODOS os campos de vínculo da fila: quem clica
                    // já sabe de qual card é, e digitar de novo é onde o erro
                    // acontecia.
                    document
                      .querySelectorAll<HTMLInputElement>('input[name="app_shop_id"]')
                      .forEach((i) => {
                        i.value = l.appShopId
                      })
                  }}
                  title="Usar este id nos campos de vínculo"
                  className="rounded-md border bg-background px-2 py-1 font-mono text-[11px] transition-colors hover:bg-muted"
                >
                  {l.appShopId}
                </button>
              ))}
            </div>
          )}
          {(r.livres ?? []).length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              Nada novo autorizado. O caminho agora é o cliente: peça pra ele
              autorizar o Delivery OS no portal do 99 e verifique de novo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
