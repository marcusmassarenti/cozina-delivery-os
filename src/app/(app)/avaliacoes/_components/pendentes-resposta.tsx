import Link from "next/link"

import { BrandLogo } from "@/components/brand-logo"
import { userCan } from "@/lib/auth/permissions"
import { getIaStatus } from "@/lib/data/diagnostico-ia"
import {
  getAvaliacoesPendentesResposta,
  PRAZO_RESPOSTA_DIAS,
} from "@/lib/data/avaliacoes-pendentes"
import { getVisibleUnits } from "@/lib/data/units"
import { ResponderAvaliacao } from "./responder-avaliacao"
import { PendentesPainel } from "./pendentes-painel"

/**
 * "Esperando resposta" — o que ainda dá pra responder, em toda a rede.
 *
 * Existe por causa do prazo: o iFood dá 5 dias e depois publica a avaliação
 * sem a resposta da loja. Numa rede, ninguém abre 16 unidades por dia pra
 * conferir — e é justamente a reclamação que fica sem resposta.
 *
 * Fora do filtro de mês DE PROPÓSITO. No dia 1º, a avaliação do dia 28 ainda
 * está no prazo; se ela sumisse com a virada do mês, o bloco perderia o
 * sentido exatamente nos dias mais críticos.
 *
 * Ordenado pelo prazo mais curto, não pela nota: uma 3★ que vence hoje é mais
 * urgente que uma 1★ com quatro dias pela frente.
 */
export async function PendentesResposta() {
  const [podeResponder, ia] = await Promise.all([
    userCan("avaliacoes", "edit"),
    getIaStatus(),
  ])

  const units = await getVisibleUnits()
  const pendentes = await getAvaliacoesPendentesResposta(units.map((u) => u.id))
  if (pendentes.length === 0) return null

  const unitById = new Map(units.map((u) => [u.id, u]))
  const ordenadas = [...pendentes].sort(
    (a, b) => a.diasRestantes - b.diasRestantes || a.nota - b.nota,
  )
  const vencendoHoje = ordenadas.filter((p) => p.diasRestantes <= 0).length
  const lojas = new Set(ordenadas.map((p) => p.unitId)).size

  return (
    <PendentesPainel
      total={ordenadas.length}
      lojas={lojas}
      vencendoHoje={vencendoHoje}
      prazoDias={PRAZO_RESPOSTA_DIAS}
    >
      <div className="divide-y">
        {ordenadas.map((p) => {
          const u = unitById.get(p.unitId)
          return (
            <div key={p.avaliacaoId} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-amber-500" title={`${p.nota} de 5`}>
                  {"★".repeat(p.nota)}
                  <span className="text-muted-foreground/30">
                    {"★".repeat(5 - p.nota)}
                  </span>
                </span>
                {u && (
                  <Link
                    href={`/unidades/${u.code}`}
                    className="flex items-center gap-1.5 font-medium hover:underline"
                  >
                    <BrandLogo size="sm" logoUrl={u.logoUrl} name={u.name} />
                    {u.name}
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                      #{u.code}
                    </span>
                  </Link>
                )}
                <span className="text-muted-foreground">
                  {fmtDia(p.dataAvaliacao)}
                </span>
              </div>
              {p.comentario && (
                <p className="mt-1 text-sm italic text-foreground/90">
                  &ldquo;{p.comentario}&rdquo;
                </p>
              )}
              {podeResponder ? (
                <ResponderAvaliacao
                  avaliacaoId={p.avaliacaoId}
                  podeIa={ia.podeUsar}
                  diasRestantes={p.diasRestantes}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="border-t px-5 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Só do iFood, e só o que a plataforma ainda aceita responder — 5★ e notas
        sem comentário já nascem publicadas. Passado o prazo de{" "}
        {PRAZO_RESPOSTA_DIAS} dias, a avaliação é publicada sem a sua resposta e
        o cliente nunca a vê.
      </p>
    </PendentesPainel>
  )
}

function fmtDia(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}
