import Link from "next/link"
import { ArrowUpRight, FileUp } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Keeta: a aba que existe pra responder "cadê a conexão da Keeta?".
 *
 * ── POR QUE ELA ESTÁ AQUI SEM TER O QUE FAZER ────────────────────────────
 * A Keeta não tem API — nem de financeiro, nem de pedidos. Tudo dela entra por
 * planilha. Antes, isso não estava escrito em lugar nenhum: quem procurava a
 * conexão da Keeta simplesmente não achava tela, e "não achei" é
 * indistinguível de "está quebrado".
 *
 * Uma aba que explica a ausência vale mais que a ausência: fecha a pergunta e
 * aponta pro caminho que funciona, que é a Importação.
 */
export async function AbaKeeta() {
  const admin = createAdminClient()
  const { count } = await admin
    .from("unit_platforms")
    .select("unit_id", { count: "exact", head: true })
    .eq("platform", "keeta")
    .eq("active", true)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-5">
        <PlatformLogo platform="keeta" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            A Keeta não tem API — e não é limitação nossa
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Eles não publicam integração de financeiro nem de pedidos. As{" "}
            <b>{count ?? 0} lojas</b> que vendem na Keeta entram por planilha, e
            é assim que segue até eles abrirem uma API.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Por isso a Keeta não aparece no relatório diário de saúde: ele mede
            o que a <i>nossa</i> integração entregou, e aqui não há integração
            pra falhar. Loja sem planilha do mês aparece na cobertura de
            importação, que é onde essa cobrança faz sentido.
          </p>
          <Link
            href="/importacao"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <FileUp className="size-4" />
            Ir para Importação
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  )
}
