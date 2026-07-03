"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Building2, Check, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ContaInfo } from "@/lib/data/conta"
import { saveContaInfo, type ContaState } from "../_actions"

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar dados"}
    </Button>
  )
}

const inputCls =
  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
const labelCls = "text-xs font-medium"

export function ContaInfoForm({
  info,
  mock,
}: {
  info: ContaInfo
  mock: boolean
}) {
  const [cpfCnpj, setCpfCnpj] = React.useState(info.cpfCnpj)
  const [cep, setCep] = React.useState(info.cep)
  const [logradouro, setLogradouro] = React.useState(info.logradouro)
  const [bairro, setBairro] = React.useState(info.bairro)
  const [cidade, setCidade] = React.useState(info.cidade)
  const [uf, setUf] = React.useState(info.uf)
  const [buscando, setBuscando] = React.useState(false)

  const [state, action] = useActionState<ContaState, FormData>(saveContaInfo, {
    ok: false,
  })
  const [savedFlash, setSavedFlash] = React.useState(false)
  React.useEffect(() => {
    if (state.ok) {
      setSavedFlash(true)
      const t = setTimeout(() => setSavedFlash(false), 2500)
      return () => clearTimeout(t)
    }
  }, [state])

  const tipo = cpfCnpj.replace(/\D/g, "").length === 14 ? "PJ" : "PF"

  async function buscarCep(valor: string) {
    const d = valor.replace(/\D/g, "")
    if (d.length !== 8) return
    setBuscando(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await res.json()
      if (!j.erro) {
        setLogradouro(j.logradouro ?? "")
        setBairro(j.bairro ?? "")
        setCidade(j.localidade ?? "")
        setUf(j.uf ?? "")
      }
    } catch {
      /* mantém o que já tem */
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="p-6">
      <form action={action} className="max-w-3xl space-y-6">
        {info.fromAsaas && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
            Puxamos esses dados do seu cadastro de cobrança (Asaas). Confira e
            salve pra fixá-los aqui na conta.
          </div>
        )}

        {/* Dados do titular */}
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            {tipo === "PJ" ? (
              <Building2 className="size-4 text-muted-foreground" />
            ) : (
              <User className="size-4 text-muted-foreground" />
            )}
            <h2 className="text-sm font-semibold">Dados do titular</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="razaoSocial">
                Nome / razão social
              </label>
              <input
                id="razaoSocial"
                name="razaoSocial"
                defaultValue={info.razaoSocial || info.name}
                required
                minLength={2}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="cpfCnpj">
                CPF ou CNPJ
              </label>
              <input
                id="cpfCnpj"
                name="cpfCnpj"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                required
                inputMode="numeric"
                placeholder="Só os números"
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Define se a conta é PF ou PJ. Vai na cobrança e na nota.
              </p>
            </div>
            <div>
              <label className={labelCls} htmlFor="email">
                E-mail de cobrança
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={info.email}
                placeholder="opcional"
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* Endereço */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Endereço (Nota Fiscal)</h2>
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="cep">
                CEP
              </label>
              <input
                id="cep"
                name="cep"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                onBlur={(e) => buscarCep(e.target.value)}
                inputMode="numeric"
                placeholder="00000-000"
                className={inputCls}
              />
              {buscando && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Buscando CEP...
                </p>
              )}
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="logradouro">
                Rua / logradouro
              </label>
              <input
                id="logradouro"
                name="logradouro"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelCls} htmlFor="numero">
                Número
              </label>
              <input
                id="numero"
                name="numero"
                defaultValue={info.numero}
                inputMode="numeric"
                placeholder="123"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="bairro">
                Bairro
              </label>
              <input
                id="bairro"
                name="bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="complemento">
                Complemento
              </label>
              <input
                id="complemento"
                name="complemento"
                defaultValue={info.complemento}
                placeholder="opcional"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="cidade">
                Cidade
              </label>
              <input
                id="cidade"
                name="cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelCls} htmlFor="uf">
                UF
              </label>
              <input
                id="uf"
                name="uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                maxLength={2}
                placeholder="SP"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="telefone">
                Telefone / WhatsApp
              </label>
              <input
                id="telefone"
                name="telefone"
                defaultValue={info.telefone}
                inputMode="numeric"
                placeholder="(00) 00000-0000"
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {mock && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            Modo simulado (sem chave Asaas): salva no banco, mas não sincroniza
            com o Asaas de verdade.
          </p>
        )}
        {state.message && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {state.message}
          </div>
        )}

        <div className="flex items-center gap-3">
          <SubmitBtn />
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="size-4" /> Dados salvos
            </span>
          )}
          {info.hasAsaasCustomer && (
            <span className="text-[11px] text-muted-foreground">
              Ao salvar, sincroniza com o Asaas (cobrança/NF).
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
