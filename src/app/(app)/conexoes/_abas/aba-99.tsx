import { createAdminClient } from "@/lib/supabase/admin"

import {
  Fila99Panel,
  type Solicitacao99,
} from "@/app/(app)/integracao/99food/_components/fila-99-panel"

/** Quantas do 99 esperam ação — alimenta o badge da aba. */
export async function pendencias99(): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from("ninefood_activation_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["pendente", "solicitada"])
  return count ?? 0
}

/**
 * ⚠️ "CONECTADA" NÃO É SOLICITAÇÃO ATIVA. (Marcus, 20/08/26: "tem mais lojas
 * conectadas na 99")
 *
 * A aba mostrava 3 e a realidade eram 21. O motivo: eu contava
 * `ninefood_activation_requests.status = 'ativa'`, mas 18 das 21 lojas foram
 * VINCULADAS DIRETO — pelo painel, pelo botão "já autorizei" do lojista ou
 * pela varredura que descobre loja nova no portal. Nenhuma delas passou por
 * uma solicitação, e por isso não existiam pra essa conta.
 *
 * A fonte da verdade de "está conectada" é `ninefood_store_links` com unidade:
 * é ele que faz o sync acontecer. Solicitação é o PEDIDO, não o vínculo — e
 * confundir os dois é o mesmo erro de medir intenção em vez de resultado.
 */
export async function lojasConectadas99(): Promise<
  { id: string; unitLabel: string; holdingName: string; appShopId: string }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, name, units(code, name, brands(holdings(name)))")
    .eq("active", true)
    .not("unit_id", "is", null)

  return ((data ?? []) as unknown as {
    app_shop_id: string
    name: string | null
    units: {
      code: string | null
      name: string
      brands: { holdings: { name: string } | null } | null
    } | null
  }[]).map((l) => ({
    id: l.app_shop_id,
    appShopId: l.app_shop_id,
    unitLabel: l.units
      ? `${l.units.code ? `${l.units.code} · ` : ""}${l.units.name}`
      : (l.name ?? l.app_shop_id),
    holdingName: l.units?.brands?.holdings?.name ?? "—",
  }))
}

export async function Aba99() {
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
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {emAberto > 0
          ? `${emAberto} loja${emAberto > 1 ? "s" : ""} esperando conexão. `
          : ""}
        A conexão do 99 não é automática: cada loja precisa ser autorizada ao
        nosso app do lado deles, e é isso que gera o{" "}
        <code className="rounded bg-muted px-1 text-xs">app_shop_id</code>. Com
        ele em mãos, vincule aqui — o cron diário passa a trazer o financeiro
        sozinho.
      </p>
      <p className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
        Uma loja só pode estar ligada a <strong>um</strong> aplicativo no 99. Se
        ela já usa outro integrador, confirme com o cliente antes de pedir a
        troca — a conexão atual dele pode parar.
      </p>
      <Fila99Panel itens={itens} conectadas={await lojasConectadas99()} />
    </div>
  )
}
