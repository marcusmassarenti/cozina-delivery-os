"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CornerDownRight, Loader2, Sparkles } from "lucide-react"

import {
  responderAvaliacaoIfood,
  sugerirRespostaAvaliacao,
} from "@/app/(app)/avaliacoes/_actions"
import {
  RESPOSTA_MAX,
  RESPOSTA_MIN,
} from "@/app/(app)/avaliacoes/_resposta-limites"

/**
 * Responder a avaliação do iFood sem sair do painel.
 *
 * Fica fechado por padrão: a tela é uma lista de leitura e um textarea aberto
 * por comentário viraria uma parede de caixas. Abre no clique, no lugar do
 * botão.
 *
 * O contador de caracteres é obrigatório, não enfeite — o iFood recusa fora de
 * 10–300 e devolve um 400 seco, sem dizer o limite.
 *
 * O Nino ESCREVE, quem envia é a pessoa. O texto cai na caixa pra ser lido e
 * editado; publicar em nome da loja sem ninguém ler não é economia de tempo
 * que valha o risco.
 */
export function ResponderAvaliacao({
  avaliacaoId,
  podeIa = false,
  diasRestantes,
}: {
  avaliacaoId: string
  /** Conta no plano AI e com a IA ligada — só aí o botão do Nino aparece. */
  podeIa?: boolean
  /** Do prazo de 5 dias do iFood. 0 = último dia. */
  diasRestantes?: number
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const [gerando, startGeracao] = useTransition()
  const router = useRouter()

  const n = texto.trim().length
  const valido = n >= RESPOSTA_MIN && n <= RESPOSTA_MAX

  if (!aberto)
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2" data-print="hide">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
        >
          <CornerDownRight className="size-3.5" />
          Responder
        </button>
        <PrazoBadge dias={diasRestantes} />
      </div>
    )

  const enviar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await responderAvaliacaoIfood(avaliacaoId, texto)
      if (!r.ok) {
        setErro(r.message ?? "Não foi possível enviar.")
        return
      }
      setAberto(false)
      // A resposta agora vem do banco; o refresh é o que troca o formulário
      // pelo balão de resposta.
      router.refresh()
    })
  }

  const gerar = () => {
    setErro(null)
    startGeracao(async () => {
      const r = await sugerirRespostaAvaliacao(avaliacaoId)
      if (!r.ok || !r.texto) {
        setErro(r.message ?? "Não consegui gerar a resposta.")
        return
      }
      setTexto(r.texto)
    })
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5" data-print="hide">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={RESPOSTA_MAX}
        autoFocus
        disabled={gerando}
        placeholder="Responda o cliente. Essa resposta fica pública no iFood."
        className="w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] tabular-nums ${
              n > 0 && !valido ? "text-amber-600" : "text-muted-foreground"
            }`}
          >
            {n}/{RESPOSTA_MAX}
            {n > 0 && n < RESPOSTA_MIN ? ` · mínimo ${RESPOSTA_MIN}` : ""}
          </span>
          {podeIa && (
            <button
              type="button"
              onClick={gerar}
              disabled={gerando || pendente}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
            >
              {gerando ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3 text-primary" />
              )}
              {texto ? "Reescrever" : "Escrever com o Nino"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAberto(false)
              setErro(null)
            }}
            disabled={pendente}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={!valido || pendente || gerando}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-40"
          >
            {pendente && <Loader2 className="size-3.5 animate-spin" />}
            Enviar
          </button>
        </div>
      </div>
      {podeIa && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          O Nino escreve o rascunho — leia antes de enviar. A resposta fica
          pública e o iFood pode invalidá-la depois se fugir das regras dele.
        </p>
      )}
      {erro && (
        <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}
    </div>
  )
}

/**
 * Quanto resta do prazo de 5 dias.
 *
 * Só aparece quando aperta (≤ 2 dias). Um selo "faltam 4 dias" em toda
 * avaliação vira ruído e some justamente quando vira urgência.
 */
function PrazoBadge({ dias }: { dias?: number }) {
  if (dias == null || dias > 2) return null
  const vencido = dias < 0
  const hoje = dias === 0
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        vencido || hoje
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
      }`}
      title="O iFood aceita resposta por 5 dias. Depois disso a avaliação é publicada sem ela."
    >
      {vencido
        ? "prazo vencido"
        : hoje
          ? "último dia pra responder"
          : `faltam ${dias} dia${dias > 1 ? "s" : ""}`}
    </span>
  )
}
