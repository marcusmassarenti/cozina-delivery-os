"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import type { ApiClientRow } from "@/lib/data/api-clients"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createApiKey, revokeApiKey, type CreateKeyState } from "../_actions"

const initialState: CreateKeyState = { ok: false }

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  } catch {
    return "—"
  }
}

export function ApiKeysManager({ clients }: { clients: ApiClientRow[] }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    createApiKey,
    initialState,
  )
  const [revoking, startRevoke] = useTransition()
  const [copied, setCopied] = useState(false)

  // Atualiza a lista quando uma chave é criada (sem tirar o box de revelação)
  useEffect(() => {
    if (state.ok && state.key) router.refresh()
  }, [state, router])

  const copyKey = async () => {
    if (!state.key) return
    try {
      await navigator.clipboard.writeText(state.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard pode falhar em http; usuário copia manual */
    }
  }

  const onRevoke = (id: string, name: string) => {
    if (
      !window.confirm(
        `Revogar a chave "${name}"? O sistema que usa ela vai parar de acessar a API.`,
      )
    )
      return
    startRevoke(async () => {
      await revokeApiKey(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Chave recém-criada — texto puro, só aparece aqui */}
      {state.ok && state.key && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
            Chave criada — copie agora. Ela não aparece de novo.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-card px-3 py-2 font-mono text-xs">
              {state.key}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyKey}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-emerald-800/80 dark:text-emerald-400/80">
            Entregue ao sistema que vai integrar. No banco guardamos só o hash.
          </p>
        </div>
      )}

      {/* Formulário de criação */}
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Label htmlFor="name" className="text-xs">
            Nome da integração
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="ERP Cozina Foods"
            className="mt-1"
            required
          />
        </div>
        <div className="w-full sm:w-40">
          <Label htmlFor="scope" className="text-xs">
            Permissão
          </Label>
          <select
            id="scope"
            name="scope"
            defaultValue="read"
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          >
            <option value="read">Leitura</option>
            <option value="write">Leitura + escrita</option>
          </select>
        </div>
        <Button type="submit" disabled={pending} className="shrink-0">
          <Plus className="size-4" />
          {pending ? "Criando…" : "Criar chave"}
        </Button>
      </form>
      {state.message && !state.ok && (
        <p className="text-xs text-rose-600">{state.message}</p>
      )}

      {/* Lista de chaves */}
      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-xs text-muted-foreground">
          Nenhuma chave criada ainda. Crie a primeira pra liberar o acesso à
          API.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Integração</th>
                <th className="px-3 py-2 text-left font-semibold">Chave</th>
                <th className="px-3 py-2 text-left font-semibold">Permissão</th>
                <th className="px-3 py-2 text-left font-semibold">Último uso</th>
                <th className="px-3 py-2 text-right font-semibold">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <KeyRound className="size-3 text-muted-foreground" />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {c.keyPrefix}…
                  </td>
                  <td className="px-3 py-2">
                    {c.scopes.includes("write") ? "Leitura + escrita" : "Leitura"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {fmtDate(c.lastUsedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.active ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                        Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Revogada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.active && (
                      <button
                        type="button"
                        onClick={() => onRevoke(c.id, c.name)}
                        disabled={revoking}
                        className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                        aria-label="Revogar chave"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
