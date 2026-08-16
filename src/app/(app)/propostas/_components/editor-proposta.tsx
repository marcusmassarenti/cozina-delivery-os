"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, FileDown, Loader2, RotateCcw, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { forcarTemaClaroNoPrint } from "@/lib/print-tema-claro"
import type { DadosProposta, Proposta } from "@/lib/data/propostas"
import type { ModeloProposta } from "@/lib/data/proposta-modelo"

import {
  mudarStatusProposta,
  recarregarClienteDaProposta,
  salvarProposta,
} from "../_actions"
import { DocumentoProposta } from "./documento-proposta"

/**
 * Editor da proposta: formulário à esquerda, documento à direita.
 *
 * O documento é o MESMO componente que vai pro PDF — não há "versão de tela" e
 * "versão de impressão". Duas renderizações do mesmo documento divergem, e a
 * divergência só aparece depois de enviado ao cliente. Na impressão, a coluna
 * do formulário some por `data-print="hide"` (regra que já existe no
 * globals.css) e sobra a folha.
 *
 * Salvamento é manual, com botão. Autosave aqui seria pior: o operador está
 * negociando preço, e um valor intermediário gravado sozinho vira o número que
 * o cliente vê se ele abrir o link no meio da digitação.
 */
export function EditorProposta({
  proposta,
  modelo,
  cadastroTemMais = false,
}: {
  proposta: Proposta
  modelo: ModeloProposta
  /** O cadastro do cliente tem dado que este retrato ainda não tem. */
  cadastroTemMais?: boolean
}) {
  const router = useRouter()
  const [d, setD] = React.useState<DadosProposta>(proposta.dados)
  const [salvando, setSalvando] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  const travada = proposta.status === "assinada"

  function set<K extends keyof DadosProposta>(k: K, v: DadosProposta[K]) {
    setD((p) => ({ ...p, [k]: v }))
    setMsg(null)
  }

  // Recalcula o total quando mexem em preço, lojas ou desconto — o número que
  // o cliente lê não pode depender de alguém lembrar de atualizar à mão.
  const totalCalculado = React.useMemo(() => {
    const bruto =
      Number(d.precoPrimeira || 0) +
      Number(d.precoAdicional || 0) * Math.max(Number(d.lojas || 1) - 1, 0)
    return Math.round((bruto - Number(d.descontoMensal || 0)) * 100) / 100
  }, [d.precoPrimeira, d.precoAdicional, d.lojas, d.descontoMensal])

  React.useEffect(() => {
    setD((p) =>
      p.totalMensal === totalCalculado ? p : { ...p, totalMensal: totalCalculado },
    )
  }, [totalCalculado])

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarProposta(proposta.id, d)
    setSalvando(false)
    if (r.ok) {
      setMsg("Salvo.")
      router.refresh()
    } else setErro(r.error ?? "Não deu.")
  }

  async function status(s: Parameters<typeof mudarStatusProposta>[1]) {
    const r = await mudarStatusProposta(proposta.id, s)
    if (r.ok) router.refresh()
    else setErro(r.error ?? "Não deu.")
  }

  function imprimir() {
    const restaurar = forcarTemaClaroNoPrint()
    let limpo = false
    const limpar = () => {
      if (limpo) return
      limpo = true
      restaurar()
      window.removeEventListener("afterprint", limpar)
    }
    window.addEventListener("afterprint", limpar)
    requestAnimationFrame(() => {
      window.print()
      setTimeout(limpar, 1500)
    })
  }

  return (
    <div className="flex flex-1 gap-5">
      {/* ── Formulário ────────────────────────────────────────────── */}
      <div
        data-print="hide"
        className="w-[340px] shrink-0 space-y-4 overflow-y-auto"
      >
        {travada && (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            Proposta <b>assinada</b> — não pode mais ser editada. Para mudar
            preço ou escopo, crie uma proposta nova.
          </p>
        )}

        <Grupo titulo="Cliente">
          {/* A proposta é um retrato do cadastro no dia em que nasceu. Quando o
              cadastro estava incompleto na hora (a DG ficou sem CNPJ até o
              espelho do Asaas rodar), este botão refaz só a parte do cliente —
              preço e desconto ficam como foram negociados. */}
          {!travada && (
            <button
              type="button"
              onClick={async () => {
                setSalvando(true)
                const r = await recarregarClienteDaProposta(proposta.id)
                setSalvando(false)
                if (r.ok) router.refresh()
                else setErro(r.error ?? r.message ?? "Erro")
              }}
              className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            >
              <RotateCcw className="size-3" />
              Puxar do cadastro de novo
            </button>
          )}
          {cadastroTemMais && !travada && (
            <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
              O cadastro do cliente tem dados que esta proposta ainda não tem.
            </p>
          )}
          <Campo label="Razão social" v={d.razaoSocial} on={(x) => set("razaoSocial", x)} ro={travada} />
          <Campo label="CNPJ" v={d.cnpj} on={(x) => set("cnpj", x)} ro={travada} />
          <Campo label="Endereço" v={d.endereco} on={(x) => set("endereco", x)} ro={travada} />
          <Campo label="Contato (nome)" v={d.contatoNome} on={(x) => set("contatoNome", x)} ro={travada} />
          <Campo label="Contato (e-mail)" v={d.contatoEmail} on={(x) => set("contatoEmail", x)} ro={travada} />
          <Campo label="Contato (telefone)" v={d.contatoTelefone} on={(x) => set("contatoTelefone", x)} ro={travada} />
        </Grupo>

        {/* Quem assina é o dono; quem paga é o financeiro. Separar os dois
            evita a cobrança que dorme três semanas na caixa errada. */}
        <Grupo titulo="Financeiro do cliente">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Quem recebe boleto e nota fiscal. Se for a mesma pessoa do contato,
            repita — ou deixe em branco e sai &quot;—&quot; na proposta.
          </p>
          <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={d.ocultarBoleto}
              onChange={(e) => set("ocultarBoleto", e.target.checked)}
              disabled={travada}
              className="size-3.5 rounded border-border"
            />
            Não mostrar a linha do boleto na proposta
          </label>
          <Campo label="Boleto — nome" v={d.contatoBoletoNome} on={(x) => set("contatoBoletoNome", x)} ro={travada || d.ocultarBoleto} />
          <Campo label="Boleto — e-mail" v={d.contatoBoletoEmail} on={(x) => set("contatoBoletoEmail", x)} ro={travada || d.ocultarBoleto} />
          <Campo label="Boleto — telefone" v={d.contatoBoletoTelefone} on={(x) => set("contatoBoletoTelefone", x)} ro={travada || d.ocultarBoleto} />
          <label className="mb-2 mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={d.ocultarNf}
              onChange={(e) => set("ocultarNf", e.target.checked)}
              disabled={travada}
              className="size-3.5 rounded border-border"
            />
            Não mostrar a linha da nota fiscal
          </label>
          <Campo label="Nota fiscal — nome" v={d.contatoNfNome} on={(x) => set("contatoNfNome", x)} ro={travada || d.ocultarNf} />
          <Campo label="Nota fiscal — e-mail" v={d.contatoNfEmail} on={(x) => set("contatoNfEmail", x)} ro={travada || d.ocultarNf} />
          <Campo label="Nota fiscal — telefone" v={d.contatoNfTelefone} on={(x) => set("contatoNfTelefone", x)} ro={travada || d.ocultarNf} />
        </Grupo>

        <Grupo titulo="Comercial">
          {/* As duas formas que existem na prática. Trocar aqui muda a tabela
              de investimento inteira — no ilimitado ela mostra um valor só, em
              vez de reconstruir "58 × R$ 79 − desconto". */}
          <div className="mb-2 flex gap-1 rounded-md border p-0.5">
            {(
              [
                ["por_loja", "1ª loja + adicionais"],
                ["ilimitado", "Valor fixo, lojas ilimitadas"],
              ] as const
            ).map(([id, rot]) => (
              <button
                key={id}
                type="button"
                disabled={travada}
                onClick={() => {
                  // Proposta antiga não tem `valorIlimitado` no JSON: trocar o
                  // modo mostraria R$ 0,00 e faria a pessoa descobrir sozinha
                  // que precisa preencher. Semeia com o total que já estava na
                  // tela, que na prática é o valor negociado.
                  if (id === "ilimitado" && !Number(d.valorIlimitado)) {
                    setD((p) => ({
                      ...p,
                      modeloPreco: id,
                      valorIlimitado: p.totalMensal,
                    }))
                    setMsg(null)
                    return
                  }
                  set("modeloPreco", id)
                }}
                className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  d.modeloPreco === id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {rot}
              </button>
            ))}
          </div>
          {d.modeloPreco === "ilimitado" && (
            <Campo
              label="Mensalidade (R$)"
              tipo="number"
              v={String(d.valorIlimitado)}
              on={(x) => set("valorIlimitado", Number(x) || 0)}
              ro={travada}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Plano" v={d.planoLabel} on={(x) => set("planoLabel", x)} ro={travada} />
            <Campo label="Lojas" tipo="number" v={String(d.lojas)} on={(x) => set("lojas", Number(x) || 1)} ro={travada} />
            <Campo label="1ª loja (R$)" tipo="number" v={String(d.precoPrimeira)} on={(x) => set("precoPrimeira", Number(x) || 0)} ro={travada} />
            <Campo label="Adicional (R$)" tipo="number" v={String(d.precoAdicional)} on={(x) => set("precoAdicional", Number(x) || 0)} ro={travada} />
            <Campo label="Desconto (R$)" tipo="number" v={String(d.descontoMensal)} on={(x) => set("descontoMensal", Number(x) || 0)} ro={travada} />
            <div className="rounded-md border bg-muted/40 px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Total mensal
              </p>
              <p className="text-sm font-bold tabular-nums">
                {d.totalMensal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
          </div>
        </Grupo>

        <Grupo titulo="Condições">
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Vencimento (dia)" tipo="number" v={String(d.vencimentoDia)} on={(x) => set("vencimentoDia", Number(x) || 10)} ro={travada} />
            <Campo label="Validade até" tipo="date" v={d.validadeAte} on={(x) => set("validadeAte", x)} ro={travada} />
            <Campo label="Setup" v={d.setup} on={(x) => set("setup", x)} ro={travada} />
            <Campo label="Treinamento" v={d.treinamento} on={(x) => set("treinamento", x)} ro={travada} />
            <Campo label="1ª cobrança" tipo="date" v={d.inicioCobranca} on={(x) => set("inicioCobranca", x)} ro={travada} />
          </div>
          <Campo label="Observações" v={d.observacoes} on={(x) => set("observacoes", x)} ro={travada} area />
        </Grupo>

        <Grupo titulo="Consultor">
          <Campo label="Nome" v={d.consultorNome} on={(x) => set("consultorNome", x)} ro={travada} />
          <Campo label="E-mail" v={d.consultorEmail} on={(x) => set("consultorEmail", x)} ro={travada} />
        </Grupo>

        <div className="sticky bottom-0 space-y-2 border-t bg-background pt-3">
          {erro && <p className="text-xs text-rose-600">{erro}</p>}
          {msg && <p className="text-xs text-emerald-600">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            {!travada && (
              <Button size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Salvar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={imprimir}>
              <FileDown className="size-3.5" />
              Gerar PDF
            </Button>
            {proposta.status === "rascunho" && (
              <Button size="sm" variant="outline" onClick={() => status("enviada")}>
                <Send className="size-3.5" />
                Marcar enviada
              </Button>
            )}
            {proposta.status === "enviada" && (
              <Button size="sm" variant="outline" onClick={() => status("assinada")}>
                <Check className="size-3.5" />
                Marcar assinada
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <b>Gerar PDF</b> abre a impressão do navegador — escolha
            &quot;Salvar como PDF&quot;. Salve antes: o PDF sai com o que está
            na tela.
          </p>
        </div>
      </div>

      {/* ── Documento (é o que imprime) ───────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <DocumentoProposta numero={proposta.numero} d={d} modelo={modelo} />
      </div>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Campo({
  label,
  v,
  on,
  tipo = "text",
  ro = false,
  area = false,
}: {
  label: string
  v: string
  on: (v: string) => void
  tipo?: string
  ro?: boolean
  area?: boolean
}) {
  const cls =
    "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-ring disabled:opacity-60"
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {area ? (
        <textarea
          value={v}
          disabled={ro}
          rows={2}
          onChange={(e) => on(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          type={tipo}
          value={v}
          disabled={ro}
          onChange={(e) => on(e.target.value)}
          className={cls}
        />
      )}
    </label>
  )
}
