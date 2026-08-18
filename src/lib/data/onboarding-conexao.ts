import "server-only"

/**
 * A esteira de conexão de uma loja recém-cadastrada.
 *
 * ── O PROBLEMA QUE ELA RESOLVE (Marcus, 18/08/26) ────────────────────────
 * "o cliente cadastra uma nova unidade, escolhe as plataformas, aperta salvar
 *  e sai da tela. mas ele precisa voltar e abrir o cadastro pra poder vincular
 *  a loja dele no ifood, 99 ou cardapioweb."
 *
 * Salvar era o fim do fluxo. A conexão virava uma tarefa solta que ninguém
 * agenda — e é o único momento em que o cliente ainda está com a intenção na
 * mão. Agora salvar leva PRA ESTEIRA, um passo por plataforma marcada.
 *
 * ⚠️ ESTA TABELA NÃO É A VERDADE SOBRE A CONEXÃO. A verdade continua em
 * `ifood_activation_requests`, `ninefood_store_links` e `cardapioweb_installs`
 * — cada plataforma com o seu mecanismo. O que mora aqui é só o passo do
 * CLIENTE: o que ele já disse que fez. Misturar as duas coisas faria a tela
 * mentir quando a autorização caísse depois.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"

export type EtapaConexao =
  | "pendente"
  | "cliente_concluiu"
  | "conectada"
  | "dispensada"

export type PassoConexao = {
  platform: PlatformId
  etapa: EtapaConexao
  clienteConcluiuEm: string | null
  conectadaEm: string | null
  /** Verdade da plataforma, conferida agora — não o que a esteira acha. */
  conectadaDeVerdade: boolean
}

/**
 * Confere, em cada plataforma, se a loja está conectada DE FATO.
 *
 * Cada uma guarda isso num lugar diferente — foi essa dispersão que fez o
 * Cardápio Web aparecer como desconectado em três telas distintas hoje.
 * Concentrar a leitura aqui é o que impede a quarta.
 */
async function conexoesReais(unitId: string): Promise<Set<PlatformId>> {
  const admin = createAdminClient()
  const out = new Set<PlatformId>()

  const [{ data: plats }, { data: links99 }, { data: cw }] = await Promise.all([
    admin
      .from("unit_platforms")
      .select("platform, api_store_id")
      .eq("unit_id", unitId)
      .not("api_store_id", "is", null),
    admin.from("ninefood_store_links").select("unit_id").eq("unit_id", unitId),
    admin.from("cardapioweb_installs").select("unit_id").eq("unit_id", unitId),
  ])

  for (const p of (plats ?? []) as { platform: string }[]) {
    out.add(p.platform as PlatformId)
  }
  if ((links99 ?? []).length > 0) out.add("99food")
  if ((cw ?? []).length > 0) out.add("cardapioweb")
  return out
}

/** Os passos da esteira de uma loja, criando as linhas que faltarem. */
export async function getPassosConexao(
  unitId: string,
): Promise<PassoConexao[]> {
  const admin = createAdminClient()

  const { data: habilitadas } = await admin
    .from("unit_platforms")
    .select("platform")
    .eq("unit_id", unitId)
    .eq("active", true)
  const plataformas = ((habilitadas ?? []) as { platform: string }[]).map(
    (p) => p.platform as PlatformId,
  )
  if (plataformas.length === 0) return []

  const { data: existentes } = await admin
    .from("onboarding_conexao")
    .select("platform, etapa, cliente_concluiu_em, conectada_em")
    .eq("unit_id", unitId)
  const porPlat = new Map(
    ((existentes ?? []) as {
      platform: string
      etapa: EtapaConexao
      cliente_concluiu_em: string | null
      conectada_em: string | null
    }[]).map((r) => [r.platform, r]),
  )

  // Cria o que falta numa tacada — a esteira precisa existir na primeira
  // abertura, senão a tela aparece vazia justo pra quem acabou de cadastrar.
  const faltando = plataformas.filter((p) => !porPlat.has(p))
  if (faltando.length > 0) {
    await admin
      .from("onboarding_conexao")
      .upsert(
        faltando.map((platform) => ({ unit_id: unitId, platform })),
        { onConflict: "unit_id,platform" },
      )
  }

  const reais = await conexoesReais(unitId)

  return plataformas.map((platform) => {
    const r = porPlat.get(platform)
    const conectadaDeVerdade = reais.has(platform)
    return {
      platform,
      // A verdade da plataforma vence a esteira: se conectou, conectou, mesmo
      // que o cliente nunca tenha clicado em "já fiz".
      etapa: conectadaDeVerdade
        ? "conectada"
        : ((r?.etapa as EtapaConexao) ?? "pendente"),
      clienteConcluiuEm: r?.cliente_concluiu_em ?? null,
      conectadaEm: r?.conectada_em ?? null,
      conectadaDeVerdade,
    }
  })
}
