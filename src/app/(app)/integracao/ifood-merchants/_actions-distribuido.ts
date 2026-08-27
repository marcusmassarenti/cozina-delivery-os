"use server"

import { revalidatePath } from "next/cache"

import { requireSuperadmin } from "@/lib/auth/guards"
import {
  pedirUserCode,
  trocarPorToken,
  distribuidoConfigurado,
  ErroIfoodDistribuido,
} from "@/lib/ifood/auth-distribuido"
import { tokenDaLoja } from "@/lib/ifood/token-por-loja"
import { fetchIfood } from "@/lib/ifood/client"
import { createAdminClient } from "@/lib/supabase/admin"

export type DistribuidoState = {
  ok: boolean
  error?: string
  message?: string
}

function revalidar() {
  revalidatePath("/conexoes")
}

/** Mensagem do iFood preservada — é ela que diz o que fazer. */
function explicar(e: unknown): string {
  if (e instanceof ErroIfoodDistribuido) {
    return e.corpo ? `${e.message} — ${e.corpo}` : e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * Passo 1 — gera o código que o lojista vai autorizar no portal DELE.
 *
 * Grava a conexão como `aguardando` na hora, antes de mostrar qualquer coisa:
 * o `code_verifier` nasce aqui e só é usado no passo 2, que acontece minutos
 * depois e em outro request. Guardar em memória perderia a conexão de quem
 * demora a autorizar — que é o caso normal, porque o lojista precisa abrir
 * o link, entrar na conta dele e voltar.
 */
export async function gerarCodigoDistribuido(
  _prev: DistribuidoState,
  formData: FormData,
): Promise<DistribuidoState> {
  await requireSuperadmin()
  if (!distribuidoConfigurado()) {
    return {
      ok: false,
      error:
        "Faltam IFOOD_DIST_CLIENT_ID e IFOOD_DIST_CLIENT_SECRET no ambiente.",
    }
  }

  const unitId = String(formData.get("unitId") ?? "").trim()
  if (!unitId) return { ok: false, error: "Escolha a loja." }

  const admin = createAdminClient()
  const { data: u } = await admin
    .from("units")
    .select("id, code, name, brands(holding_id)")
    .eq("id", unitId)
    .maybeSingle()
  const unidade = u as unknown as {
    id: string
    code: string
    name: string
    brands: { holding_id: string } | null
  } | null
  if (!unidade) return { ok: false, error: "Loja não encontrada." }

  /* Uma conexão ATIVA por loja — o índice único parcial da 0194 já garante,
   * mas errar aqui daria erro de banco cru na cara de quem clicou. E o
   * motivo importa: duas credenciais sincronizando o mesmo merchant seriam
   * chamada e log em dobro contra o mesmo teto de rate limit. */
  const { data: jaTem } = await admin
    .from("ifood_conexoes_distribuidas")
    .select("id")
    .eq("unit_id", unitId)
    .eq("status", "ativa")
    .maybeSingle()
  if (jaTem) {
    return {
      ok: false,
      error: "Essa loja já tem uma conexão direta ativa.",
    }
  }

  try {
    const c = await pedirUserCode()
    const { error } = await admin.from("ifood_conexoes_distribuidas").insert({
      holding_id: unidade.brands?.holding_id ?? null,
      unit_id: unitId,
      user_code: c.userCode,
      code_verifier: c.codeVerifier,
      verification_url: c.verificationUrlComplete,
      user_code_expira_em: c.expiraEm.toISOString(),
      status: "aguardando",
    })
    if (error) return { ok: false, error: error.message }
    revalidar()
    return {
      ok: true,
      message: `Código gerado para #${unidade.code} ${unidade.name}. Mande o link pro lojista.`,
    }
  } catch (e) {
    return { ok: false, error: explicar(e) }
  }
}

/**
 * Passo 2 — troca o código que o LOJISTA devolveu pelo token daquela loja.
 *
 * ⚠️ NÃO vincula o merchant à unidade aqui. Autorizar e vincular são decisões
 * diferentes: o token prova que o lojista liberou, mas quem diz que ESTE
 * merchant é a unidade #NN somos nós — e vincular no cliente errado mistura o
 * faturamento de dois clientes, que é o pior erro desta tela. Então a ação
 * descobre o merchant, mostra o nome, e deixa o clique de vincular para quem
 * está lendo.
 */
export async function concluirVinculoDistribuido(
  _prev: DistribuidoState,
  formData: FormData,
): Promise<DistribuidoState> {
  await requireSuperadmin()
  const conexaoId = String(formData.get("conexaoId") ?? "").trim()
  const codigo = String(formData.get("authorizationCode") ?? "").trim()
  if (!conexaoId) return { ok: false, error: "conexaoId ausente" }
  if (!codigo) return { ok: false, error: "Cole o código que o lojista mandou." }

  const admin = createAdminClient()
  const { data: c } = await admin
    .from("ifood_conexoes_distribuidas")
    .select("id, unit_id, code_verifier, status")
    .eq("id", conexaoId)
    .maybeSingle()
  const conexao = c as {
    id: string
    unit_id: string | null
    code_verifier: string | null
    status: string
  } | null
  if (!conexao) return { ok: false, error: "Conexão não encontrada." }
  if (!conexao.code_verifier) {
    return {
      ok: false,
      error:
        "O par secreto dessa tentativa não está mais guardado — gere um código novo.",
    }
  }

  try {
    const t = await trocarPorToken(codigo, conexao.code_verifier)

    const { error: erroSalvar } = await admin.rpc("ifood_dist_salvar_tokens", {
      p_conexao_id: conexaoId,
      p_access: t.accessToken,
      p_refresh: t.refreshToken,
      p_expires_at: t.expiraEm.toISOString(),
    })
    if (erroSalvar) {
      return { ok: false, error: `Token veio, mas não guardei: ${erroSalvar.message}` }
    }

    /* O `code_verifier` morre aqui: ele serve uma vez só, e segredo que não
     * tem mais uso não deve continuar guardado. */
    await admin
      .from("ifood_conexoes_distribuidas")
      .update({
        status: "ativa",
        code_verifier: null,
        erro: null,
        atualizada_em: new Date().toISOString(),
      })
      .eq("id", conexaoId)

    // Com o token DA LOJA em mãos, a Merchant API devolve só o que ela
    // autorizou — é assim que descobrimos de qual merchant se trata.
    let achado = ""
    try {
      const tk = await tokenDaLoja(conexao.unit_id ?? "")
      const r = await fetchIfood<{ id: string; name?: string }[]>({
        path: "/merchant/v1.0/merchants",
        method: "GET",
        responseType: "json",
        obterToken: tk?.obter,
        endpointLabel: "GET /merchant/v1.0/merchants (distribuído)",
      })
      const lista = Array.isArray(r.data) ? r.data : []
      if (lista.length === 1) {
        await admin
          .from("ifood_conexoes_distribuidas")
          .update({ merchant_id: lista[0].id })
          .eq("id", conexaoId)
        achado = ` O lojista liberou: ${lista[0].name ?? lista[0].id}.`
      } else if (lista.length > 1) {
        achado = ` Ele liberou ${lista.length} lojas — confira qual é a certa antes de vincular.`
      }
    } catch (e) {
      console.error("[ifood-dist] não consegui listar o merchant:", e)
    }

    revalidar()
    return {
      ok: true,
      message: `Autorizado.${achado} Agora vincule o merchant à unidade na lista acima.`,
    }
  } catch (e) {
    await admin
      .from("ifood_conexoes_distribuidas")
      .update({ erro: explicar(e), atualizada_em: new Date().toISOString() })
      .eq("id", conexaoId)
    return { ok: false, error: explicar(e) }
  }
}

/** Descarta uma tentativa — código vencido, loja errada, lojista desistiu. */
export async function descartarConexaoDistribuida(
  _prev: DistribuidoState,
  formData: FormData,
): Promise<DistribuidoState> {
  await requireSuperadmin()
  const conexaoId = String(formData.get("conexaoId") ?? "").trim()
  if (!conexaoId) return { ok: false, error: "conexaoId ausente" }
  const { error } = await createAdminClient()
    .from("ifood_conexoes_distribuidas")
    .update({ status: "expirada", atualizada_em: new Date().toISOString() })
    .eq("id", conexaoId)
    .neq("status", "ativa")
  if (error) return { ok: false, error: error.message }
  revalidar()
  return { ok: true, message: "Tentativa descartada." }
}
