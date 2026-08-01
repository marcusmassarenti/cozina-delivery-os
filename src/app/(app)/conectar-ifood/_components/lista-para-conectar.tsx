"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"

import { consultarCnpj } from "@/lib/unidade-perfil"
import type { LojaParaConectar } from "@/lib/data/conectar-ifood"

import { solicitarConexaoEmLote, type ConectarLoteState } from "../_actions"

const inicial: ConectarLoteState = { ok: false }

function mascara(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

type Confere = { razao?: string; situacao?: string; erro?: boolean }

/**
 * Conta só o que tem CNPJ preenchido, não o que está marcado.
 *
 * Prometer "pedir conexão de 8 lojas" quando 5 estão sem CNPJ é prometer o que
 * não vai acontecer: essas 5 voltam na hora com "preencha o CNPJ". O número no
 * botão tem que ser o que de fato vai entrar na fila.
 */
function Botao({ prontas, faltamCnpj }: { prontas: number; faltamCnpj: number }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending || prontas === 0}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {prontas === 0
          ? "Preencha o CNPJ pra continuar"
          : `Pedir conexão de ${prontas} ${prontas === 1 ? "loja" : "lojas"}`}
      </button>
      {faltamCnpj > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {faltamCnpj} {faltamCnpj === 1 ? "loja fica" : "lojas ficam"} de fora
          por enquanto — {faltamCnpj === 1 ? "falta o CNPJ" : "faltam os CNPJs"}.
        </p>
      )}
    </div>
  )
}

export function ListaParaConectar({ lojas }: { lojas: LojaParaConectar[] }) {
  const router = useRouter()
  const [estado, action] = useActionState(solicitarConexaoEmLote, inicial)

  // Começa tudo marcado: a pessoa veio até aqui pra conectar, não pra
  // escolher. Desmarcar uma é mais raro que marcar nove.
  const [marcadas, setMarcadas] = React.useState<Set<string>>(
    () => new Set(lojas.map((l) => l.unitId)),
  )
  // Campo começa VAZIO quando o CNPJ do cadastro é exatamente o que já foi
  // recusado. Repor o número recusado convida a pessoa a clicar e tomar a
  // mesma recusa; vazio obriga a olhar o aviso logo abaixo.
  const [cnpjs, setCnpjs] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      lojas.map((l) => [
        l.unitId,
        l.cnpj && l.cnpj === l.recusadoAntes ? "" : mascara(l.cnpj ?? ""),
      ]),
    ),
  )
  const [confere, setConfere] = React.useState<Record<string, Confere>>({})

  React.useEffect(() => {
    if (estado.ok) router.refresh()
  }, [estado.ok, router])

  async function conferir(unitId: string, valor: string) {
    const d = valor.replace(/\D/g, "")
    if (d.length !== 14) return
    const r = await consultarCnpj(d)
    setConfere((c) => ({
      ...c,
      [unitId]: r
        ? { razao: r.razaoSocial, situacao: r.situacao ?? undefined }
        : { erro: true },
    }))
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {estado.message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            estado.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {estado.message}
        </p>
      )}

      <div className="divide-y rounded-lg border bg-background">
        {lojas.map((l) => {
          const marcada = marcadas.has(l.unitId)
          const c = confere[l.unitId]
          const erro = estado.porLoja?.[l.unitId]
          return (
            <div key={l.unitId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <label className="flex flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  name="unidades"
                  value={l.unitId}
                  checked={marcada}
                  onChange={(e) =>
                    setMarcadas((s) => {
                      const n = new Set(s)
                      if (e.target.checked) n.add(l.unitId)
                      else n.delete(l.unitId)
                      return n
                    })
                  }
                  className="size-4"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {l.code} · {l.name}
                  </span>
                  {l.city && (
                    <span className="block text-xs text-muted-foreground">
                      {l.city}
                    </span>
                  )}
                </span>
              </label>

              <div className="sm:w-72">
                <input
                  name={`cnpj_${l.unitId}`}
                  value={cnpjs[l.unitId] ?? ""}
                  onChange={(e) =>
                    setCnpjs((s) => ({
                      ...s,
                      [l.unitId]: mascara(e.target.value),
                    }))
                  }
                  onBlur={(e) => conferir(l.unitId, e.target.value)}
                  placeholder="00.000.000/0000-00"
                  disabled={!marcada}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-40"
                />
                {erro && (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    {erro}
                  </p>
                )}
                {!erro && l.recusadoAntes && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    Já tentamos {mascara(l.recusadoAntes)} e o iFood não achou a
                    loja. Veja no Portal do Parceiro qual CNPJ está no cadastro
                    dela — costuma ser outro.
                  </p>
                )}
                {!erro && c?.razao && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {c.razao}
                    {c.situacao && c.situacao.toUpperCase() !== "ATIVA" && (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {" "}
                        · situação {c.situacao}
                      </span>
                    )}
                  </p>
                )}
                {!erro && c?.erro && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Não consegui conferir na Receita agora — o pedido segue
                    mesmo assim.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Botao
          prontas={
            [...marcadas].filter(
              (id) => (cnpjs[id] ?? "").replace(/\D/g, "").length === 14,
            ).length
          }
          faltamCnpj={
            [...marcadas].filter(
              (id) => (cnpjs[id] ?? "").replace(/\D/g, "").length !== 14,
            ).length
          }
        />
        <p className="text-xs text-muted-foreground">
          Depois de pedir, o iFood mostra a autorização no seu Portal do
          Parceiro — é lá que você aprova.
        </p>
      </div>
    </form>
  )
}

export function TudoConectado() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-4">
      <CheckCircle2 className="size-5 text-emerald-500" />
      <p className="text-sm">
        Todas as suas lojas do iFood já puxam os dados sozinhas. Nada a fazer
        aqui.
      </p>
    </div>
  )
}

export function AvisoEmAndamento({ quantas }: { quantas: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-sm">
        {quantas} {quantas === 1 ? "loja já foi pedida" : "lojas já foram pedidas"}{" "}
        e {quantas === 1 ? "espera" : "esperam"} sua aprovação no Portal do
        Parceiro.
      </p>
    </div>
  )
}
