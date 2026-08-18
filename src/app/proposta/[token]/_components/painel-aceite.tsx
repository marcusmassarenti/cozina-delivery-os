"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"

import type { AceiteProposta, StatusProposta } from "@/lib/data/propostas"

import { aceitarProposta, recusarProposta } from "../_actions"

/**
 * O painel de resposta do cliente — o botão que fecha o negócio.
 *
 * ── DECISÕES QUE PARECEM DETALHE E NÃO SÃO ───────────────────────────────
 * • A caixinha "li e concordo" é OBRIGATÓRIA e separada do botão. É ela que
 *   transforma o clique em manifestação de vontade: um botão sozinho pode ser
 *   apertado por engano, e "eu só cliquei pra ver o que acontecia" é uma
 *   defesa que a caixinha tira da mesa.
 * • Os campos pedem nome COMPLETO e CPF do signatário, não da empresa: quem
 *   assina é uma pessoa. O CNPJ da empresa já está no documento acima.
 * • "Não vou seguir" existe e fica visível. Sem essa saída, quem decidiu não
 *   fechar simplesmente não responde — e a proposta fica "enviada" pra sempre,
 *   sem ninguém saber se foi um não ou um esquecimento.
 * • Depois de respondida, o painel some e sobra o recibo. Nada de deixar o
 *   formulário na tela convidando a aceitar duas vezes.
 */
export function PainelAceite({
  token,
  status,
  aceite,
  razaoSocial,
}: {
  token: string
  status: StatusProposta
  aceite: AceiteProposta | null
  razaoSocial: string
}) {
  const router = useRouter()
  const [nome, setNome] = React.useState("")
  const [cpf, setCpf] = React.useState("")
  const [cargo, setCargo] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [concordo, setConcordo] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [recusando, setRecusando] = React.useState(false)
  const [motivo, setMotivo] = React.useState("")

  if (status === "assinada" && aceite) {
    return (
      <div
        data-print="hide"
        className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5"
      >
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
          <Check className="size-4" />
          Proposta aceita
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-800">
          Registramos seu aceite em{" "}
          {new Date(aceite.em).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          })}
          . O comprovante foi enviado para <b>{aceite.email}</b> — ele também
          está impresso no fim do documento acima.
        </p>
        <p className="mt-2 text-[13px] text-emerald-800">
          A partir daqui é com a gente. Qualquer dúvida, responda o e-mail do
          comprovante.
        </p>
      </div>
    )
  }

  if (status === "recusada") {
    return (
      <div
        data-print="hide"
        className="mt-5 rounded-lg border bg-white p-5 text-[13px] text-zinc-600"
      >
        Recebemos sua resposta — esta proposta foi recusada. Se mudar de ideia
        ou quiser outra condição, é só falar com a gente.
      </div>
    )
  }

  async function aceitar() {
    setErro(null)
    setEnviando(true)
    const r = await aceitarProposta(token, { nome, cpf, cargo, email })
    setEnviando(false)
    if (r.ok) router.refresh()
    else setErro(r.erro ?? "Não deu para registrar. Tente de novo.")
  }

  async function recusar() {
    setEnviando(true)
    const r = await recusarProposta(token, motivo)
    setEnviando(false)
    if (r.ok) router.refresh()
    else setErro(r.erro ?? "Não deu. Tente de novo.")
  }

  return (
    <div
      data-print="hide"
      className="mt-5 rounded-lg border-2 border-[#ff4d1c] bg-white p-5"
    >
      <h2 className="text-base font-extrabold tracking-tight text-zinc-900">
        Aceitar esta proposta
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">
        O aceite aqui tem o mesmo efeito da assinatura no papel: vincula{" "}
        <b>{razaoSocial || "sua empresa"}</b> às condições descritas acima.
        <b> Não é preciso imprimir nem assinar à mão.</b> Preencha os dados de
        quem está aceitando.
      </p>
      {/* O que fica registrado e por quê. Mora aqui, e não no documento, porque
          o documento vira o PDF que fica com o cliente — instrução de tela
          sujaria o arquivo (Marcus, 18/08/26). Este painel é
          `data-print="hide"`. */}
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Ao aceitar, ficam registrados o nome e o documento informados, a data e
        hora, o IP de origem e um hash do conteúdo desta proposta — o que dá
        validade jurídica ao aceite eletrônico (art. 4º, I, da Lei nº
        14.063/2020). O comprovante passa a constar na própria proposta.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Campo
          label="Nome completo"
          v={nome}
          on={setNome}
          dica="De quem está aceitando, não da empresa"
        />
        <Campo
          label="CPF"
          v={cpf}
          on={(x) => setCpf(mascara(x))}
          dica="Ou CNPJ, se preferir assinar pela empresa"
        />
        <Campo label="Cargo" v={cargo} on={setCargo} dica="Sócio, diretor…" />
        <Campo
          label="E-mail"
          v={email}
          on={setEmail}
          tipo="email"
          dica="É pra onde vai o comprovante"
        />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md bg-zinc-50 p-3">
        <input
          type="checkbox"
          checked={concordo}
          onChange={(e) => setConcordo(e.target.checked)}
          className="mt-0.5 size-4 accent-[#ff4d1c]"
        />
        <span className="text-[13px] leading-relaxed text-zinc-700">
          Li e concordo com esta proposta comercial e com o{" "}
          <a
            href="/contrato"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-zinc-900 underline underline-offset-2"
          >
            Contrato de Prestação de Serviços
          </a>
          , e declaro ter poderes para representar a empresa neste ato.
        </span>
      </label>

      {erro && <p className="mt-3 text-[13px] font-medium text-rose-600">{erro}</p>}

      <button
        onClick={aceitar}
        disabled={!concordo || enviando}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#ff4d1c] px-5 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {enviando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        Aceitar proposta
      </button>

      <div className="mt-4 border-t pt-3">
        {recusando ? (
          <div className="space-y-2">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Se quiser, conte o motivo (opcional)"
              className="w-full rounded-md border px-2.5 py-2 text-[13px] outline-none focus:border-zinc-400"
            />
            <div className="flex gap-2">
              <button
                onClick={recusar}
                disabled={enviando}
                className="rounded-md border px-3 py-1.5 text-[12px] font-semibold text-zinc-700"
              >
                Confirmar recusa
              </button>
              <button
                onClick={() => setRecusando(false)}
                className="px-2 text-[12px] text-zinc-500"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setRecusando(true)}
            className="text-[12px] text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
          >
            Não vou seguir com esta proposta
          </button>
        )}
      </div>
    </div>
  )
}

/** Máscara só visual — o servidor valida os dígitos de novo, sempre. */
function mascara(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 14)
  if (n.length <= 11)
    return n
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  return n
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

function Campo({
  label,
  v,
  on,
  tipo = "text",
  dica,
}: {
  label: string
  v: string
  on: (v: string) => void
  tipo?: string
  dica?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type={tipo}
        value={v}
        onChange={(e) => on(e.target.value)}
        className="w-full rounded-md border px-2.5 py-2 text-sm outline-none focus:border-zinc-400"
      />
      {dica && <span className="mt-1 block text-[11px] text-zinc-400">{dica}</span>}
    </label>
  )
}
