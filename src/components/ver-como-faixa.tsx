import { Eye } from "lucide-react"

import { getVerComoHoldingId } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Faixa fixa avisando que o que está na tela é de OUTRA empresa.
 *
 * O risco desse recurso não é invasão — é esquecer. Olhar o faturamento de um
 * cliente achando que é o seu, e decidir alguma coisa a partir disso. Por isso
 * a faixa é vermelha, aparece em TODA tela e diz o nome da empresa por
 * extenso; a saída fica dentro dela, no lugar onde a pessoa vai procurar.
 */
export async function VerComoFaixa() {
  const holdingId = await getVerComoHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from("holdings")
    .select("name")
    .eq("id", holdingId)
    .maybeSingle()

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-rose-400 bg-rose-600 px-6 py-2.5 text-xs font-medium text-white">
      <Eye className="size-4 shrink-0" />
      <span>
        Você está vendo o sistema como{" "}
        <b>{data?.name ?? "outro cliente"}</b>. Estes números não são os seus.
      </span>
      <span className="opacity-80">Somente leitura — nada pode ser alterado.</span>
      <a
        href="/api/ver-como/sair"
        className="ml-auto rounded-md bg-white/15 px-2.5 py-1 font-semibold underline-offset-2 hover:bg-white/25"
      >
        Sair desta visão
      </a>
    </div>
  )
}
