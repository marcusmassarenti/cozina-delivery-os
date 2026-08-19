import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Plug } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"

import { Fila99Panel, type Solicitacao99 } from "./_components/fila-99-panel"

/**
 * Fila de ativação do 99 Food (admin da plataforma).
 *
 * Gêmea de /integracao/ifood-merchants, mas sem a tabela de merchants: no 99
 * não existe endpoint que liste as lojas autorizadas ao nosso app. O
 * `app_shop_id` vem do portal deles por fora, e o trabalho aqui é colá-lo pra
 * criar o vínculo — que até então era INSERT escrito à mão em migration.
 */
export default async function Fila99Page() {
  // Fila de ativação é operação da plataforma, não do cliente.
  if (!(await isSuperadmin())) notFound()
  const admin = createAdminClient()

  const { data } = await admin
    .from("ninefood_activation_requests")
    .select(
      "id, cnpj, loja_99, status, nota, created_at, cliente_confirmou_at, holdings(name), units(code, name)",
    )
    .order("created_at", { ascending: false })
    .limit(200)

  const itens: Solicitacao99[] = (
    (data ?? []) as unknown as Array<{
      id: string
      cnpj: string
      loja_99: string | null
      status: Solicitacao99["status"]
      nota: string | null
      created_at: string
      cliente_confirmou_at: string | null
      holdings: { name: string } | null
      units: { code: string | null; name: string } | null
    }>
  ).map((r) => ({
    id: r.id,
    cnpj: r.cnpj,
    loja99: r.loja_99,
    status: r.status,
    nota: r.nota,
    holdingName: r.holdings?.name ?? "—",
    unitLabel: r.units
      ? `${r.units.code ? `${r.units.code} · ` : ""}${r.units.name}`
      : null,
    createdAt: r.created_at,
    clienteConfirmouEm: r.cliente_confirmou_at,
  }))

  // Em aberto primeiro: a fila serve pra AGIR, e o resolvido é histórico.
  const ordem = { pendente: 0, solicitada: 1, recusada: 2, ativa: 3 } as const
  itens.sort((a, b) => ordem[a.status] - ordem[b.status])
  const emAberto = itens.filter(
    (i) => i.status === "pendente" || i.status === "solicitada",
  ).length

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/clientes/conexoes"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Conexões de API
        </Link>
        <div className="flex items-center gap-2.5">
          <Plug className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Conexões 99 Food
          </h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {emAberto > 0
            ? `${emAberto} loja${emAberto > 1 ? "s" : ""} esperando conexão. `
            : ""}
          A conexão do 99 não é automática: cada loja precisa ser autorizada ao
          nosso app do lado deles, e é isso que gera o{" "}
          <code className="rounded bg-muted px-1 text-xs">app_shop_id</code>.
          Com ele em mãos, vincule aqui — o cron diário passa a trazer o
          financeiro sozinho.
        </p>
        <p className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          Uma loja só pode estar ligada a <strong>um</strong> aplicativo no 99.
          Se ela já usa outro integrador, confirme com o cliente antes de pedir
          a troca — a conexão atual dele pode parar.
        </p>
      </div>

      <Fila99Panel itens={itens} />
    </div>
  )
}
