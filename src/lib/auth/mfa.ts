/**
 * Autenticação em dois fatores (2FA) via TOTP — app autenticador.
 *
 * Usa o MFA nativo do Supabase Auth. O vocabulário dele é "AAL"
 * (Authenticator Assurance Level):
 *   - aal1 = entrou só com e-mail e senha
 *   - aal2 = entrou com senha E validou o código do app autenticador
 *
 * `getAuthenticatorAssuranceLevel()` devolve o nível ATUAL e o nível QUE A
 * CONTA EXIGE. Quando o exigido é aal2 e o atual é aal1, a pessoa passou pela
 * senha mas ainda deve o código — é esse o gancho que trava o app.
 *
 * Decisão de produto: o 2FA é OPCIONAL e por usuário. Quem não ativar continua
 * entrando só com senha. Não travamos a rede toda de uma vez porque perder o
 * celular sem plano de recuperação deixaria a operação sem acesso ao próprio
 * faturamento.
 */
import "server-only"

import { createClient } from "@/lib/supabase/server"

export type MfaStatus = {
  /** Já existe um app autenticador confirmado nesta conta. */
  ativo: boolean
  /** Passou pela senha mas ainda deve o código de 6 dígitos. */
  precisaVerificar: boolean
  /** Id do fator confirmado (para desafio/remoção). */
  factorId: string | null
  /** Fatores criados e nunca confirmados — lixo de tentativas abandonadas. */
  pendentes: string[]
}

/** Situação do 2FA do usuário logado. */
export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createClient()

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: fatores } = await supabase.auth.mfa.listFactors()

  // `listFactors().totp` já vem só com os verificados; `all` traz os demais.
  const verificado = fatores?.totp?.[0] ?? null
  const pendentes = (fatores?.all ?? [])
    .filter((f) => f.status !== "verified")
    .map((f) => f.id)

  return {
    ativo: !!verificado,
    precisaVerificar:
      aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2",
    factorId: verificado?.id ?? null,
    pendentes,
  }
}
