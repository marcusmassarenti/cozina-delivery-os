/**
 * Lojas que marcaram uma plataforma no cadastro e nunca trouxeram dado.
 *
 * NÃO é falha de integração — é dado que o cliente disse que existe e não
 * entregou. Fica fora do painel de saúde de propósito: lá o vermelho é pra
 * coisa que quebrou, e misturar as duas foi o que fez o resumo dizer "12/58"
 * quando havia 7 lojas conectadas, todas em dia.
 *
 * Parte disso é cadastro errado (marcou Keeta e nunca vendeu na Keeta), então
 * o aviso sempre vem junto da saída "não vendo nessa plataforma".
 *
 * ── LOJA QUE AINDA NÃO ABRIU NÃO ENTRA (Marcus, 22/08/26) ────────────────
 * O Churrasco Royal cadastrou 16 lojas de uma vez, várias ainda em
 * inauguração, e a faixa passou a dizer "15 lojas no 99 Food · 15 no Cardápio
 * Web · 9 no iFood sem nenhum dado" — 39 pares numa rede de 16 lojas. Nada
 * disso é cadastro errado: elas simplesmente não abriram, e quando abrirem o
 * próprio cliente pede a conexão.
 *
 * A regra que separa os dois: só entra loja que JÁ VENDEU em alguma
 * plataforma. Loja em operação com uma plataforma marcada e zerada é cadastro
 * errado de verdade — vale a pergunta. Loja sem venda em lugar nenhum ainda
 * não começou, e cobrar dela é cobrar o calendário do cliente.
 */
import "server-only"

import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export type LojaSemDado = {
  unitId: string
  code: string
  nome: string
  plataforma: "ifood" | "99food" | "keeta"
}

export async function getLojasSemDado(
  unitIds: string[],
): Promise<LojaSemDado[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()

  // Escopo do usuário: franqueado não pode ver (nem desmarcar) loja alheia.
  const acessiveis = await getAccessibleUnitIds()
  const alvo =
    acessiveis === null ? unitIds : unitIds.filter((id) => acessiveis.includes(id))
  if (alvo.length === 0) return []

  const { data, error } = await admin.rpc("lojas_sem_dado", { p_unit_ids: alvo })
  if (error) {
    console.error("getLojasSemDado:", error.message)
    return []
  }
  let linhas = (data ?? []) as { unit_id: string; plataforma: string }[]
  if (linhas.length === 0) return []

  /* Filtra as que nunca venderam em NENHUMA plataforma — ver a nota do topo.
   * O sinal é a própria RPC: se a loja aparece em todas as plataformas que
   * declarou, ela não trouxe dado de nenhuma, e portanto não está operando. */
  const declaradas = new Map<string, number>()
  {
    let q = admin
      .from("unit_platforms")
      .select("unit_id, platform")
      .eq("active", true)
      .in("unit_id", [...new Set(linhas.map((l) => l.unit_id))])
    const { data: ups } = await q
    for (const u of (ups ?? []) as { unit_id: string }[])
      declaradas.set(u.unit_id, (declaradas.get(u.unit_id) ?? 0) + 1)
  }
  const semDadoPorLoja = new Map<string, number>()
  for (const l of linhas)
    semDadoPorLoja.set(l.unit_id, (semDadoPorLoja.get(l.unit_id) ?? 0) + 1)

  const operando = new Set(
    [...semDadoPorLoja.entries()]
      .filter(([id, n]) => n < (declaradas.get(id) ?? 0))
      .map(([id]) => id),
  )
  linhas = linhas.filter((l) => operando.has(l.unit_id))
  if (linhas.length === 0) return []

  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", [...new Set(linhas.map((l) => l.unit_id))])
  const porId = new Map(
    ((units ?? []) as { id: string; code: string; name: string }[]).map((u) => [
      u.id,
      u,
    ]),
  )

  return linhas
    .map((l) => ({
      unitId: l.unit_id,
      code: porId.get(l.unit_id)?.code ?? "",
      nome: porId.get(l.unit_id)?.name ?? "loja",
      plataforma: l.plataforma as LojaSemDado["plataforma"],
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
