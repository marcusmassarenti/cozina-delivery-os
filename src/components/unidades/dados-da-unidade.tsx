"use client"

import * as React from "react"

import { CampoCnpj } from "@/components/unidades/campo-cnpj"
import {
  TIPOS_COZINHA,
  TIPOS_ENTREGA,
  TIPOS_OPERACAO,
} from "@/lib/unidade-perfil"

export type PerfilUnidade = {
  cnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  tipoCozinha?: string | null
  tipoOperacao?: string | null
  tipoEntrega?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  telefone?: string | null
  responsavelNome?: string | null
  responsavelEmail?: string | null
  cnaeDescricao?: string | null
  situacaoCadastral?: string | null
}

function Campo({
  label,
  children,
  span = 6,
}: {
  label: string
  children: React.ReactNode
  span?: number
}) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <label className="text-xs font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

const inputCls =
  "h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground/60"

/**
 * Aba "Dados da unidade" — quem é a loja no papel.
 *
 * Separada da operação de proposito: sao duas perguntas diferentes e dois
 * momentos diferentes. Aqui e o cadastro que quase nao muda (CNPJ, razao
 * social, endereco); do outro lado fica o que muda toda semana (plataformas,
 * IDs, se esta ativa).
 *
 * Misturados num formulario so, o cadastro ficava soterrado embaixo de campo
 * tecnico de plataforma — e foi por isso que 18 unidades chegaram ate aqui sem
 * CNPJ.
 */
export function DadosDaUnidade({
  perfil,
  erroCnpj,
  cidade,
  onCidade,
  nome,
}: {
  perfil?: PerfilUnidade
  erroCnpj?: string
  cidade: string
  onCidade: (v: string) => void
  nome?: string | null
}) {
  const [razao, setRazao] = React.useState(perfil?.razaoSocial ?? "")

  return (
    <div className="grid grid-cols-12 gap-3">
      <Campo label="Nome da unidade *" span={6}>
        <input
          name="name"
          defaultValue={nome ?? ""}
          placeholder="ex.: Loja Centro"
          required
          className={inputCls}
        />
      </Campo>

      <div className="col-span-6">
        <CampoCnpj
          defaultValue={perfil?.cnpj ?? ""}
          erro={erroCnpj}
          onDados={(d) => {
            setRazao(d.razaoSocial)
            if (d.cidade) onCidade(d.cidade)
          }}
        />
      </div>

      <Campo label="Razão social" span={7}>
        <input
          name="razao_social"
          value={razao}
          onChange={(e) => setRazao(e.target.value)}
          placeholder="vem da Receita ao consultar o CNPJ"
          className={inputCls}
        />
      </Campo>

      <Campo label="Tipo de cozinha" span={5}>
        <select
          name="tipo_cozinha"
          defaultValue={perfil?.tipoCozinha ?? ""}
          className={inputCls}
        >
          <option value="">Selecione…</option>
          {TIPOS_COZINHA.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Campo>

      <Campo label="Endereço" span={7}>
        <input
          name="logradouro"
          defaultValue={perfil?.logradouro ?? ""}
          placeholder="rua / avenida"
          className={inputCls}
        />
      </Campo>
      <Campo label="Número" span={2}>
        <input name="numero" defaultValue={perfil?.numero ?? ""} className={inputCls} />
      </Campo>
      <Campo label="Complemento" span={3}>
        <input
          name="complemento"
          defaultValue={perfil?.complemento ?? ""}
          className={inputCls}
        />
      </Campo>

      <Campo label="Bairro" span={4}>
        <input name="bairro" defaultValue={perfil?.bairro ?? ""} className={inputCls} />
      </Campo>
      <Campo label="CEP" span={3}>
        <input name="cep" defaultValue={perfil?.cep ?? ""} className={inputCls} />
      </Campo>
      <Campo label="Cidade *" span={5}>
        <input
          name="city"
          value={cidade}
          onChange={(e) => onCidade(e.target.value)}
          required
          className={inputCls}
        />
      </Campo>

      <Campo label="Telefone" span={4}>
        <input
          name="telefone"
          defaultValue={perfil?.telefone ?? ""}
          placeholder="(11) 90000-0000"
          className={inputCls}
        />
      </Campo>
      <Campo label="Responsável" span={4}>
        <input
          name="responsavel_nome"
          defaultValue={perfil?.responsavelNome ?? ""}
          placeholder="quem toca a loja"
          className={inputCls}
        />
      </Campo>
      <Campo label="E-mail do responsável" span={4}>
        <input
          name="responsavel_email"
          type="email"
          defaultValue={perfil?.responsavelEmail ?? ""}
          className={inputCls}
        />
      </Campo>

      {(perfil?.cnaeDescricao || perfil?.situacaoCadastral) && (
        <p className="col-span-12 text-[11px] text-muted-foreground">
          {perfil.cnaeDescricao}
          {perfil.situacaoCadastral && (
            <span
              className={
                perfil.situacaoCadastral.toUpperCase() === "ATIVA"
                  ? ""
                  : " font-semibold text-rose-600 dark:text-rose-400"
              }
            >
              {perfil.cnaeDescricao ? " · " : ""}
              situação {perfil.situacaoCadastral}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/** Aba "Operação" — o que muda com frequência. */
export function OperacaoDaUnidade({
  perfil,
  children,
}: {
  perfil?: PerfilUnidade
  /** Plataformas, IDs e inaugurações — cada diálogo monta o seu. */
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-12 gap-3">
        <Campo label="Modelo da unidade" span={6}>
          <select
            name="tipo_operacao"
            defaultValue={perfil?.tipoOperacao ?? "propria"}
            className={inputCls}
          >
            {TIPOS_OPERACAO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Quem entrega" span={6}>
          <select
            name="tipo_entrega"
            defaultValue={perfil?.tipoEntrega ?? ""}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {TIPOS_ENTREGA.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Campo>
        <p className="col-span-12 -mt-1 text-[11px] text-muted-foreground">
          Quem entrega muda a leitura do dinheiro: em entrega própria o frete
          cobrado do cliente entra no caixa da loja e a comissão do iFood tem
          outro nome no extrato.
        </p>
      </div>

      {children}
    </div>
  )
}
