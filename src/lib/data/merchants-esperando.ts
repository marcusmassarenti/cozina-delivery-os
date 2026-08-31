import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { donosDosMerchants } from "@/lib/ifood/dono-do-merchant"

/**
 * Lojas que autorizaram o acesso no iFood e ainda não têm unidade cadastrada.
 *
 * ── POR QUE ISSO EXISTE ─────────────────────────────────────────────────
 * O caminho normal é: o cliente pede a conexão, o lojista aprova no Portal
 * do Parceiro, o merchant passa a aparecer na nossa lista, e alguém cadastra
 * a unidade pra o dado começar a entrar. Quando o último passo não acontece,
 * a loja fica autorizada e MUDA — o iFood libera o dado e ninguém vem
 * buscar.
 *
 * Quatro lojas da DG FOODS estavam assim em 31/08/26, esperando havia 34, 32,
 * 31 e 27 dias. Ninguém percebeu porque a única tela que mostra isso é
 * interna, e o cliente — que é quem cadastra — não tinha como saber.
 *
 * ⚠️ CADASTRAR É DECISÃO DO CLIENTE, não nossa. Em vários planos a loja nova
 * mexe na fatura, e só ele sabe o código interno, o nome que usa e se aquela
 * loja entra na operação agora. Por isso esta função só INFORMA — não existe
 * nenhum caminho automático a partir dela.
 */

export type LojaEsperando = {
  nome: string
  cnpj: string | null
  dias: number
}

/** Por nome de cliente, pra casar com o agrupamento do e-mail semanal. */
export async function lojasEsperandoCadastro(): Promise<
  Map<string, LojaEsperando[]>
> {
  const admin = createAdminClient()
  const [{ data: merchants }, { data: vinculos }, donos] = await Promise.all([
    admin
      .from("ifood_merchants")
      .select("id, name, cnpj, first_seen_at, ignorado_em"),
    admin
      .from("unit_platforms")
      .select("api_store_id")
      .eq("platform", "ifood")
      .not("api_store_id", "is", null),
    donosDosMerchants(),
  ])

  const jaVinculado = new Set(
    ((vinculos ?? []) as { api_store_id: string }[]).map((v) => v.api_store_id),
  )

  const out = new Map<string, LojaEsperando[]>()
  const agora = Date.now()
  for (const m of (merchants ?? []) as {
    id: string
    name: string | null
    cnpj: string | null
    first_seen_at: string | null
    ignorado_em: string | null
  }[]) {
    if (jaVinculado.has(m.id)) continue
    // Ignorado é decisão tomada — não volta a cobrar.
    if (m.ignorado_em) continue
    const dono = donos[m.id]
    // Sem dono deduzido não dá pra avisar ninguém: seria mandar a pendência
    // de um cliente pra outro, que é pior que não mandar.
    if (!dono) continue

    const dias = m.first_seen_at
      ? Math.floor((agora - new Date(m.first_seen_at).getTime()) / 86_400_000)
      : 0
    const lista = out.get(dono.name) ?? []
    lista.push({ nome: m.name ?? "(sem nome)", cnpj: m.cnpj, dias })
    out.set(dono.name, lista)
  }

  // Quem espera há mais tempo primeiro — é a ordem em que se resolve.
  for (const lista of out.values()) lista.sort((a, b) => b.dias - a.dias)
  return out
}
