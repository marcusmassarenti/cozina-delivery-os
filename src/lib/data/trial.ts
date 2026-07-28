/**
 * O teste grátis começa a contar no PRIMEIRO ACESSO.
 *
 * Antes o relógio começava no cadastro. Quem se cadastrava, não confirmava o
 * e-mail e voltava três dias depois encontrava um teste pela metade — e a
 * primeira impressão do produto virava "isto aqui já está acabando". Cliente
 * que nunca viu uma tela não pode estar gastando o teste.
 *
 * `trial_ends_at` segue preenchido desde o cadastro de propósito: é a rede de
 * segurança pra quem nunca entra: sem ela a conta ficaria em teste eterno.
 * Aqui ele é apenas reescrito quando o acesso finalmente acontece.
 */
import "server-only"

import { auditar } from "@/lib/data/auditoria"
import { createAdminClient } from "@/lib/supabase/admin"

const DIAS_DE_TESTE = 7

export async function iniciarTrialSePrimeiroAcesso(
  holdingId: string | null,
): Promise<void> {
  if (!holdingId) return
  try {
    const admin = createAdminClient()

    const { data: h } = await admin
      .from("holdings")
      .select("id, name, paid, trial_iniciado_em, trial_ends_at")
      .eq("id", holdingId)
      .maybeSingle()

    // Já iniciado (o caso de 99,9% dos carregamentos) ou já é pagante: nada a
    // fazer. Esta função roda em toda tela autenticada, então o caminho comum
    // precisa custar uma leitura e mais nada.
    if (!h || h.trial_iniciado_em || h.paid) return

    const fim = new Date()
    fim.setDate(fim.getDate() + DIAS_DE_TESTE)
    const novoFim = fim.toISOString().slice(0, 10)

    // Guarda condicional no próprio UPDATE: se dois carregamentos entrarem ao
    // mesmo tempo (o layout roda em cada aba aberta), só o primeiro grava.
    const { data: gravou } = await admin
      .from("holdings")
      .update({ trial_iniciado_em: new Date().toISOString(), trial_ends_at: novoFim })
      .eq("id", holdingId)
      .is("trial_iniciado_em", null)
      .select("id")

    if (!gravou?.length) return

    await auditar("trial.iniciado", holdingId, {
      antes: h.trial_ends_at ?? null,
      depois: novoFim,
      motivo: "primeiro acesso",
    })
  } catch (e) {
    // Nunca derruba a tela que a pessoa acabou de abrir.
    console.error("iniciarTrialSePrimeiroAcesso:", e)
  }
}
