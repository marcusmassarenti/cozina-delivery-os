"use client"

import * as React from "react"
import { Check, Loader2, Search } from "lucide-react"

import { consultarCnpj, type DadosReceita } from "@/lib/unidade-perfil"

/**
 * CNPJ com preenchimento automatico pela Receita (BrasilAPI).
 *
 * Dispara ao SAIR do campo, nao a cada tecla: consultar no meio da digitacao
 * seria uma chamada por caractere e ainda erraria, porque so faz sentido com
 * os 14 digitos completos.
 *
 * Falha da API nao trava nada. O CNPJ e obrigatorio; a consulta e conveniencia
 * — se a Receita estiver fora, a pessoa preenche na mao e segue.
 */
export function CampoCnpj({
  defaultValue,
  onDados,
  erro,
}: {
  defaultValue?: string
  onDados?: (d: DadosReceita) => void
  erro?: string
}) {
  const [valor, setValor] = React.useState(defaultValue ?? "")
  const [estado, setEstado] = React.useState<"parado" | "buscando" | "ok" | "falhou">("parado")
  const [achado, setAchado] = React.useState<DadosReceita | null>(null)
  const ultimo = React.useRef<string>("")

  function formatar(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 14)
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
  }

  async function buscar() {
    const digitos = valor.replace(/\D/g, "")
    if (digitos.length !== 14 || digitos === ultimo.current) return
    ultimo.current = digitos
    setEstado("buscando")
    const d = await consultarCnpj(digitos)
    if (!d) {
      setEstado("falhou")
      return
    }
    setAchado(d)
    setEstado("ok")
    onDados?.(d)
  }

  const baixado = achado?.situacao && achado.situacao.toUpperCase() !== "ATIVA"

  return (
    <div>
      <label className="text-xs font-medium">
        CNPJ <span className="text-primary">*</span>
      </label>
      <div className="relative mt-1">
        <input
          name="cnpj"
          value={valor}
          onChange={(e) => {
            setValor(formatar(e.target.value))
            setEstado("parado")
          }}
          onBlur={buscar}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
          className={`w-full rounded-md border bg-background px-3 py-2 pr-9 text-sm ${
            erro ? "border-rose-400" : ""
          }`}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {estado === "buscando" ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : estado === "ok" ? (
            <Check className="size-4 text-emerald-600" />
          ) : (
            <Search className="size-4 text-muted-foreground/50" />
          )}
        </span>
      </div>

      {erro && <p className="mt-1 text-[11px] text-rose-600">{erro}</p>}

      {estado === "buscando" && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          consultando a Receita...
        </p>
      )}
      {estado === "falhou" && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          Nao consegui consultar agora — pode preencher o resto na mao.
        </p>
      )}
      {estado === "ok" && achado && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{achado.razaoSocial}</span>
          {achado.cnaeDescricao ? ` · ${achado.cnaeDescricao}` : ""}
          {baixado && (
            <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
              — situacao {achado.situacao}
            </span>
          )}
        </p>
      )}

      {/* Só o que NÃO tem campo visível no formulário.
          
          ⚠️ Endereço, bairro, CEP, telefone e razão social saíram daqui: eles
          têm input visível com o MESMO name, e o navegador mandava os dois. O
          vazio (visível) sobrescrevia o preenchido (escondido) e o endereço
          nunca era salvo. Quem preenche o campo visível agora é o onDados. */}
      {achado && (
        <>
          <input type="hidden" name="nome_fantasia" value={achado.nomeFantasia ?? ""} />
          <input type="hidden" name="cnae_codigo" value={achado.cnaeCodigo ?? ""} />
          <input type="hidden" name="cnae_descricao" value={achado.cnaeDescricao ?? ""} />
          <input type="hidden" name="data_abertura" value={achado.dataAbertura ?? ""} />
          <input type="hidden" name="situacao_cadastral" value={achado.situacao ?? ""} />
        </>
      )}

    </div>
  )
}
