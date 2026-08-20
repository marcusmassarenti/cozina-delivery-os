import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { pedirConexaoEmLote } from "@/lib/unidades/cadastro-em-lote"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reenvia o aviso das solicitações criadas em lote que ficaram sem e-mail.
 *
 * Rota de uso único, protegida pelo CRON_SECRET: as 30 solicitações do
 * Churrasco Royal foram gravadas por SQL em 19/08/26 e o aviso, que mora na
 * server action, não saiu. `pedirConexaoEmLote` não duplica pedido em aberto,
 * então rodar aqui só produz o e-mail que faltou.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("units")
    .select("id, code, name, cnpj, brands(holding_id, holdings(name))")
    .eq("brand_id", "e21cd151-f0cf-4b0e-8b50-25eba3798ab6")
    .gte("code", "02")
    .order("code")

  const lojas = ((data ?? []) as unknown as {
    id: string
    code: string
    name: string
    cnpj: string
    brands: { holding_id: string; holdings: { name: string } | null } | null
  }[]).filter((u) => u.code !== "01")

  if (lojas.length === 0) {
    return NextResponse.json({ ok: false, erro: "nenhuma loja encontrada" })
  }

  const r = await pedirConexaoEmLote({
    holdingId: lojas[0]!.brands!.holding_id,
    cliente: lojas[0]!.brands?.holdings?.name ?? "Churrasco Royal Poços",
    lojas: lojas.map((u) => ({
      unitId: u.id,
      code: u.code,
      name: u.name,
      cnpj: u.cnpj,
    })),
    plataformas: ["ifood", "99food"],
    nota: "Cadastro em lote de 15 lojas (19/08)",
  })

  return NextResponse.json({ ok: true, lojas: lojas.length, ...r })
}
