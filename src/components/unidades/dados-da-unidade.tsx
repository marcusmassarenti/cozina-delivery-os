"use client"

import * as React from "react"

import { CampoCnpj } from "@/components/unidades/campo-cnpj"
import {
  inferirCozinha,
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
  regimeFiscal?: string | null
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
  onUf,
  nome,
}: {
  perfil?: PerfilUnidade
  erroCnpj?: string
  cidade: string
  onCidade: (v: string) => void
  /**
   * A UF vive no componente PAI (é ela que monta o <select>), então a consulta
   * ao CNPJ não conseguia preenchê-la — cidade vinha da Receita e o estado
   * ficava no padrão. Foi assim que a Le Petit Pastéis ficou "GOIANIA / SP".
   */
  onUf?: (v: string) => void
  nome?: string | null
}) {
  // Controlados porque a consulta ao CNPJ os preenche. Com defaultValue eles
  // ficariam parados na tela — foi o que aconteceu no primeiro teste: a Receita
  // respondia, a razão social aparecia e o endereço continuava vazio.
  const [razao, setRazao] = React.useState(perfil?.razaoSocial ?? "")
  const [logradouro, setLogradouro] = React.useState(perfil?.logradouro ?? "")
  const [numero, setNumero] = React.useState(perfil?.numero ?? "")
  const [complemento, setComplemento] = React.useState(perfil?.complemento ?? "")
  const [bairro, setBairro] = React.useState(perfil?.bairro ?? "")
  const [cep, setCep] = React.useState(perfil?.cep ?? "")
  const [telefone, setTelefone] = React.useState(perfil?.telefone ?? "")

  // Sugestão de cozinha pelo nome. Só sugere enquanto a pessoa não escolheu:
  // sobrescrever escolha manual a cada tecla digitada seria pior que não
  // sugerir nada.
  const [nomeUnidade, setNomeUnidade] = React.useState(nome ?? "")
  const [cozinha, setCozinha] = React.useState(perfil?.tipoCozinha ?? "")
  const [sugerida, setSugerida] = React.useState(false)
  const escolhidaNaMao = React.useRef(Boolean(perfil?.tipoCozinha))

  function sugerir(nomeDigitado: string, nomeFantasia?: string | null) {
    if (escolhidaNaMao.current) return
    const tipo = inferirCozinha(nomeDigitado, nomeFantasia)
    setCozinha(tipo ?? "")
    setSugerida(Boolean(tipo))
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <Campo label="Nome da unidade *" span={6}>
        <input
          name="name"
          value={nomeUnidade}
          onChange={(e) => {
            setNomeUnidade(e.target.value)
            sugerir(e.target.value)
          }}
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
            // Só sobrescreve o que a Receita realmente trouxe: se ela vier sem
            // complemento, não apaga o que a pessoa já tinha digitado.
            setRazao(d.razaoSocial)
            if (d.cidade) onCidade(d.cidade)
            if (d.uf) onUf?.(d.uf)
            if (d.logradouro) setLogradouro(d.logradouro)
            if (d.numero) setNumero(d.numero)
            if (d.complemento) setComplemento(d.complemento)
            if (d.bairro) setBairro(d.bairro)
            if (d.cep) setCep(d.cep)
            if (d.telefone) setTelefone(d.telefone)
            // Segunda chance pra cozinha: o nome fantasia da Receita às vezes
            // diz o que o nome interno esconde ("Bello Pane" → padaria).
            sugerir(nomeUnidade, d.nomeFantasia)
          }}
        />
      </div>

      <Campo label="Razão social" span={7}>
        <input
          name="razao_social"
            required
          value={razao}
          onChange={(e) => setRazao(e.target.value)}
          placeholder="vem da Receita ao consultar o CNPJ"
          className={inputCls}
        />
      </Campo>

      <Campo label="Tipo de cozinha" span={5}>
        <select
          name="tipo_cozinha"
            required
          value={cozinha}
          onChange={(e) => {
            escolhidaNaMao.current = true
            setSugerida(false)
            setCozinha(e.target.value)
          }}
          className={inputCls}
        >
          <option value="">Selecione…</option>
          {TIPOS_COZINHA.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {sugerida && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sugerido pelo nome — troque se não for.
          </p>
        )}
      </Campo>

      <Campo label="Endereço" span={7}>
        <input
          name="logradouro"
            required
          value={logradouro}
          onChange={(e) => setLogradouro(e.target.value)}
          placeholder="rua / avenida"
          className={inputCls}
        />
      </Campo>
      <Campo label="Número" span={2}>
        <input
          name="numero"
            required
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className={inputCls}
        />
      </Campo>
      <Campo label="Complemento" span={3}>
        <input
          name="complemento"
          value={complemento}
          onChange={(e) => setComplemento(e.target.value)}
          className={inputCls}
        />
      </Campo>

      <Campo label="Bairro" span={4}>
        <input
          name="bairro"
            required
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
          className={inputCls}
        />
      </Campo>
      <Campo label="CEP" span={3}>
        <input
          name="cep"
            required
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          className={inputCls}
        />
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
            required
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(11) 90000-0000"
          className={inputCls}
        />
      </Campo>
      <Campo label="Responsável" span={4}>
        <input
          name="responsavel_nome"
            required
          defaultValue={perfil?.responsavelNome ?? ""}
          placeholder="quem toca a loja"
          className={inputCls}
        />
      </Campo>
      <Campo label="E-mail do responsável" span={4}>
        <input
          name="responsavel_email"
            required
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
            required
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
        {/* Regime fiscal decide se o imposto da NF de compra é custo ou
            crédito. Fica no cadastro da LOJA porque dentro de uma rede uma
            unidade pode ter estourado o teto do Simples enquanto as outras
            não — e no SaaS cada cliente tem o seu. */}
        <Campo label="Regime fiscal" span={6}>
          <select
            name="regime_fiscal"
            required
            defaultValue={perfil?.regimeFiscal ?? "simples"}
            className={inputCls}
          >
            <option value="simples">Simples Nacional</option>
            <option value="normal">Regime Normal (credita imposto)</option>
          </select>
        </Campo>
        <Campo label="Quem entrega" span={6}>
          <select
            name="tipo_entrega"
            required
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
