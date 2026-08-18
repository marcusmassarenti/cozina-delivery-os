import { MessageSquareReply } from "lucide-react"

import { fmtNum, fmtPct } from "@/lib/format"
import type { PlacarResposta } from "@/lib/data/avaliacoes-pendentes"

/**
 * Placar de resposta às avaliações: quantas foram respondidas, quantas se
 * perderam no prazo, quantas ainda dá pra salvar.
 *
 * ── POR QUE ELE EXISTE (Marcus, 18/08/26) ────────────────────────────────
 * A fila de "Esperando resposta" mostra o agora. Ela não conta que, das que já
 * fecharam prazo, a rede respondeu 96 e perdeu 463. O que sai da fila sem
 * resposta simplesmente sumia, e sumir é o oposto de medir.
 *
 * A vencida saiu da lista de trabalho e virou este número. Fila é fotografia;
 * placar é o filme.
 */
export function PlacarRespostaCard({
  placar,
  compacto = false,
}: {
  placar: PlacarResposta
  /** No Dashboard cabe menos: some a barra e o texto de rodapé. */
  compacto?: boolean
}) {
  const { respondidas, perdidas, naFila, aproveitamento } = placar
  const fechadas = respondidas + perdidas
  if (placar.respondiveis === 0) return null

  const pct = aproveitamento ?? 0
  const cor =
    pct >= 0.7
      ? "text-emerald-600"
      : pct >= 0.3
        ? "text-amber-600"
        : "text-rose-600"

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <MessageSquareReply className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-bold">Respostas às avaliações</h3>
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Só entram as que têm comentário — nota sem comentário o iFood publica
        direto e nunca abre prazo de resposta.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Respondidas
          </p>
          <p className="text-xl font-bold tabular-nums text-emerald-600">
            {fmtNum(respondidas)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Perdidas
          </p>
          <p className="text-xl font-bold tabular-nums text-rose-600">
            {fmtNum(perdidas)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Na fila
          </p>
          <p className="text-xl font-bold tabular-nums">{fmtNum(naFila)}</p>
        </div>
      </div>

      {fechadas > 0 && (
        <>
          {/* A barra é do que JÁ FECHOU prazo. A fila fica de fora: ela ainda
              pode virar resposta, e contá-la como perda seria condenar o que
              está em aberto. */}
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-emerald-500"
              style={{ width: `${(respondidas / fechadas) * 100}%` }}
            />
            <div
              className="bg-rose-500"
              style={{ width: `${(perdidas / fechadas) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px]">
            <span className={`font-bold ${cor}`}>{fmtPct(pct * 100, 0)}</span>{" "}
            <span className="text-muted-foreground">
              das {fmtNum(fechadas)} que fecharam prazo foram respondidas
            </span>
          </p>
        </>
      )}

      {!compacto && perdidas > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Avaliação perdida é a que passou dos 5 dias sem resposta: o iFood
          publica assim mesmo e o cliente nunca vê o que a loja escreveria.
          Não dá pra recuperar — só pra não repetir.
        </p>
      )}
    </div>
  )
}
