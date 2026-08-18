import { PartyPopper } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import type { ConexaoNova } from "@/lib/data/conexoes-novas"

const ROTULO = {
  "99food": "99 Food",
  cardapioweb: "Cardápio Web",
} as const

/**
 * "Sua loja foi conectada!" para 99 Food e Cardápio Web.
 *
 * ── POR QUE (Marcus, 18/08/26): "o cliente fica perdido" ─────────────────
 * O iFood comemorava a conexão e as outras duas não diziam nada. Quem conecta
 * o Cardápio Web vê a tela igual à de antes e não sabe se funcionou — e o
 * silêncio no meio de um onboarding é o que faz a pessoa desistir ou abrir
 * chamado.
 *
 * A mensagem muda conforme o dado JÁ ter chegado: "conectada" quando ainda
 * está trazendo, "já trazendo dado" quando chegou. Dizer "pronto!" com a tela
 * ainda vazia seria prometer o que a pessoa não vê.
 */
export function ConexaoNovaAviso({ conexoes }: { conexoes: ConexaoNova[] }) {
  if (conexoes.length === 0) return null

  return (
    <div className="space-y-2">
      {conexoes.map((c) => (
        <div
          key={`${c.plataforma}|${c.unitId}`}
          className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
            <PartyPopper className="size-4 text-emerald-700 dark:text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              <span>
                Sua loja <b>{c.unitCode} · {c.unitName}</b> foi conectada ao
              </span>
              <PlatformLogo platform={c.plataforma} size="sm" />
              <span>{ROTULO[c.plataforma]}! 🎉</span>
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {c.temDado ? (
                <>
                  Faturamento e pedidos <b>já estão entrando sozinhos</b> pela
                  API — sem planilha.
                </>
              ) : (
                <>
                  Estamos trazendo o histórico agora. Os números aparecem aqui
                  assim que a primeira carga terminar — não precisa fazer nada.
                </>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
