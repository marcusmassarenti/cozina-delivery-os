import Link from "next/link"
import { Sparkles, Lock } from "lucide-react"

import { getConsultorEstado, listarConversas } from "@/lib/data/ia-chat"
import { getVisibleUnits } from "@/lib/data/units"
import { ConsultorChat } from "./_components/consultor-chat"

export const dynamic = "force-dynamic"

/**
 * Consultor IA — chat que responde sobre a operação com os números reais da
 * conta. Gated no plano DeliveryOS AI; sem plano, vira upsell. As conversas
 * ficam salvas por usuário (histórico na lateral, como o Claude).
 */
export default async function ConsultorIaPage() {
  const estado = await getConsultorEstado()
  const restantes = Math.max(0, estado.limiteMes - estado.usadasMes) + estado.creditos
  // Só busca o histórico/lojas quando a tela vai mesmo mostrar o chat.
  const podeUsar = estado.isAi && estado.configurado && estado.lojas > 0
  const [conversas, units] = podeUsar
    ? await Promise.all([listarConversas(), getVisibleUnits()])
    : [[], []]
  const lojas = units.map((u) => ({ id: u.id, code: u.code, name: u.name }))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Título */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-6 text-primary" />
          Consultor IA
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pergunte sobre a sua operação e receba a resposta com os seus números
          reais.
        </p>
      </div>

      {!estado.isAi ? (
        <Upsell />
      ) : !estado.configurado ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          O Consultor IA ainda está sendo ativado nesta conta. Fale com o
          suporte se isso persistir.
        </div>
      ) : estado.lojas === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Cadastre ao menos uma loja pra usar o Consultor.
        </div>
      ) : (
        <ConsultorChat
          conversasIniciais={conversas}
          restantesIniciais={restantes}
          lojas={lojas}
        />
      )}
    </div>
  )
}

/** Bloqueio pra quem não tem o plano DeliveryOS AI. */
function Upsell() {
  return (
    <div className="rounded-xl border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10">
        <Lock className="size-6 text-primary" />
      </div>
      <p className="mt-4 text-base font-semibold">
        O Consultor IA faz parte do plano DeliveryOS AI
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Um consultor que responde na hora sobre o seu faturamento, CMV,
        cancelamento e taxas — usando os números reais das suas lojas.
      </p>
      <Link
        href="/assinatura"
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        Conhecer o plano
      </Link>
    </div>
  )
}
