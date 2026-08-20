import { notFound } from "next/navigation"
import { Cable } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

import { Abas, ehAba } from "./_abas/abas"
import { AbaGeral } from "./_abas/aba-geral"
import { AbaIfood } from "./_abas/aba-ifood"
import { Aba99 } from "./_abas/aba-99"
import { AbaCardapioWeb } from "./_abas/aba-cardapioweb"
import { AbaKeeta } from "./_abas/aba-keeta"
import { AbaApi } from "./_abas/aba-api"

export const dynamic = "force-dynamic"

/**
 * CONEXÕES — uma tela só, com abas.
 *
 * Ver `_abas/abas.tsx` para o porquê da consolidação e da aba na URL.
 *
 * Só os CONTADORES são carregados sempre (duas contagens baratas, `head:true`);
 * o conteúdo pesado é o da aba aberta. Sem isso, abrir Conexões pra ver a fila
 * do 99 pagaria o preço do Cardápio Web, que é a página mais cara das seis.
 */
export default async function ConexoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string
    loja?: string
    sandbox?: string
    cw?: string
  }>
}) {
  if (!(await isSuperadmin())) notFound()
  const params = await searchParams
  const aba = ehAba(params.aba)

  const admin = createAdminClient()
  const [ifood, noventa] = await Promise.all([
    admin
      .from("ifood_activation_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pendente", "solicitada"]),
    admin
      .from("ninefood_activation_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pendente", "solicitada"]),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Cable className="size-6 text-muted-foreground" />
          Conexões
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tudo que liga o sistema às plataformas — e ao ERP.
        </p>
      </div>

      <Abas
        atual={aba}
        pendencias={{ ifood: ifood.count ?? 0, "99food": noventa.count ?? 0 }}
      />

      {/* O conteúdo herda a borda da aba ativa, pra leitura de "pasta". */}
      <div className="rounded-b-xl rounded-tr-xl border bg-card p-5">
        {aba === "geral" && <AbaGeral />}
        {aba === "ifood" && <AbaIfood />}
        {aba === "99food" && <Aba99 />}
        {aba === "cardapioweb" && (
          <AbaCardapioWeb searchParams={Promise.resolve(params)} />
        )}
        {aba === "keeta" && <AbaKeeta />}
        {aba === "api" && <AbaApi />}
      </div>
    </div>
  )
}
