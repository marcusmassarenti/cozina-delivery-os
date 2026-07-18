import Link from "next/link"
import { Sparkles, Lock } from "lucide-react"

import {
  getConsultorEstado,
  listarConversas,
  getPacoteConfig,
} from "@/lib/data/ia-chat"
import { getVisibleUnits } from "@/lib/data/units"
import { getCurrentUserContext } from "@/lib/auth/context"
import { ConsultorChat } from "./_components/consultor-chat"

export const dynamic = "force-dynamic"

/**
 * Nino AI — chat que responde sobre a operação com os números reais da conta.
 * Gated no plano DeliveryOS AI; sem plano, vira upsell. As conversas ficam
 * salvas por usuário (histórico na lateral, como o Claude).
 */
export default async function ConsultorIaPage() {
  const [estado, user] = await Promise.all([
    getConsultorEstado(),
    getCurrentUserContext(),
  ])
  const restantes = Math.max(0, estado.limiteMes - estado.usadasMes) + estado.creditos
  const primeiroNome = user.fullName.split(" ")[0] ?? user.fullName
  // Só busca o histórico/lojas quando a tela vai mesmo mostrar o chat.
  const podeUsar = estado.isAi && estado.configurado && estado.lojas > 0
  const [conversas, units, pacote] = podeUsar
    ? await Promise.all([listarConversas(), getVisibleUnits(), getPacoteConfig()])
    : [[], [], { preco: 0, tamanho: 100 }]
  const lojas = units.map((u) => ({ id: u.id, code: u.code, name: u.name }))

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full min-h-0 flex-col gap-3 bg-muted/30 p-4 md:p-6">
      {/* Título (compacto) */}
      <h1 className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight">
        <Sparkles className="size-5 text-primary" />
        Nino AI
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          IA
        </span>
      </h1>

      {!estado.isAi ? (
        <Upsell />
      ) : !estado.configurado ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          O Nino AI ainda está sendo ativado nesta conta. Fale com o suporte se
          isso persistir.
        </div>
      ) : estado.lojas === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Cadastre ao menos uma loja pra falar com o Nino.
        </div>
      ) : (
        <ConsultorChat
          conversasIniciais={conversas}
          restantesIniciais={restantes}
          lojas={lojas}
          pacote={pacote}
          nome={primeiroNome}
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
        O Nino AI faz parte do plano DeliveryOS AI
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
