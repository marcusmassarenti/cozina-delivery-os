import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { renovarToken, ErroIfoodDistribuido } from "./auth-distribuido"

/** Renova com esta folga antes de vencer — token que expira no meio da
 *  chamada custa um 401 e uma volta a mais. */
const FOLGA_MS = 5 * 60 * 1000

export type TokenDaLoja = {
  conexaoId: string
  /** Passe direto em `fetchIfood({ obterToken })`. */
  obter: (renovar: boolean) => Promise<string>
}

/**
 * O token do app DISTRIBUÍDO desta loja — ou `null` se ela não usa esse
 * caminho.
 *
 * `null` NÃO é erro: é a resposta para as 108 lojas do app centralizado, que
 * é o caminho normal hoje. Quem chama trata assim:
 *
 *     const t = await tokenDaLoja(unitId)
 *     await fetchIfood({ path, obterToken: t?.obter })
 *
 * Com `obterToken` indefinido o `fetchIfood` usa o token global de sempre, e
 * a loja centralizada não muda de comportamento por existir este módulo.
 *
 * ⚠️ UMA LOJA USA UM CAMINHO OU O OUTRO, NUNCA OS DOIS. O índice único
 * parcial da migration 0194 garante uma conexão `ativa` por unidade; se as
 * duas credenciais sincronizassem o mesmo merchant, seriam chamadas e logs
 * em dobro contra o mesmo teto de rate limit.
 *
 * ⚠️ O token vive no Vault, não na tabela — a tabela só guarda os ids. Ler e
 * gravar passam pelas duas funções `security definer` liberadas apenas ao
 * `service_role`. Não existe caminho anônimo para o segredo, e é de propósito:
 * RPC anônima com poder demais já foi o P0 desta base duas vezes.
 */
export async function tokenDaLoja(unitId: string): Promise<TokenDaLoja | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_conexoes_distribuidas")
    .select("id")
    .eq("unit_id", unitId)
    .eq("status", "ativa")
    .maybeSingle()

  const conexaoId = (data as { id: string } | null)?.id
  if (!conexaoId) return null

  return {
    conexaoId,
    obter: (renovar: boolean) => obterToken(conexaoId, renovar),
  }
}

async function obterToken(
  conexaoId: string,
  renovar: boolean,
): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("ifood_dist_ler_tokens", {
    p_conexao_id: conexaoId,
  })
  if (error) throw new Error(`Não consegui ler o token da loja: ${error.message}`)

  const linha = (Array.isArray(data) ? data[0] : data) as
    | { access_token: string | null; refresh_token: string | null; expires_at: string | null }
    | undefined

  const acesso = linha?.access_token ?? null
  const refresh = linha?.refresh_token ?? null
  const vence = linha?.expires_at ? new Date(linha.expires_at).getTime() : 0

  // Serve o que está em mãos quando ainda dá tempo — e o 401 é quem pede
  // renovação fora dessa conta, com `renovar`.
  if (!renovar && acesso && vence > Date.now() + FOLGA_MS) return acesso

  if (!refresh) {
    // Sem refresh não há como voltar sozinho: o lojista precisa autorizar de
    // novo. Marcar como revogada tira a loja do caminho distribuído em vez de
    // deixá-la falhando calada a cada rodada.
    await marcarRevogada(conexaoId, "sem refresh_token guardado")
    throw new Error(
      "A conexão desta loja com o iFood precisa ser autorizada de novo pelo lojista.",
    )
  }

  try {
    const novo = await renovarToken(refresh)
    const { error: erroSalvar } = await admin.rpc("ifood_dist_salvar_tokens", {
      p_conexao_id: conexaoId,
      p_access: novo.accessToken,
      // O iFood pode ou não rotacionar o refresh. Quando não manda um novo,
      // o antigo continua valendo — gravar null aqui apagaria o único jeito
      // de renovar da próxima vez.
      p_refresh: novo.refreshToken ?? refresh,
      p_expires_at: novo.expiraEm.toISOString(),
    })
    if (erroSalvar) {
      // O token novo é bom mesmo que a gravação falhe: devolve ele e deixa a
      // próxima rodada renovar de novo. Derrubar a sincronização por causa de
      // uma escrita seria trocar dado do cliente por arrumação nossa.
      console.error("[ifood-dist] falhei ao guardar o token novo:", erroSalvar.message)
    }
    return novo.accessToken
  } catch (e) {
    // 400/401 na renovação = o lojista tirou o app. Qualquer outra coisa
    // (rede, 5xx) é transitória e NÃO pode revogar a conexão — revogar por
    // instabilidade obrigaria o lojista a autorizar de novo à toa.
    const status = e instanceof ErroIfoodDistribuido ? e.status : 0
    if (status === 400 || status === 401) {
      await marcarRevogada(
        conexaoId,
        e instanceof Error ? e.message : "refresh recusado pelo iFood",
      )
      throw new Error(
        "O iFood não aceita mais a autorização desta loja — o lojista precisa autorizar de novo.",
      )
    }
    throw e
  }
}

async function marcarRevogada(conexaoId: string, motivo: string): Promise<void> {
  await createAdminClient()
    .from("ifood_conexoes_distribuidas")
    .update({ status: "revogada", erro: motivo, atualizada_em: new Date().toISOString() })
    .eq("id", conexaoId)
}
