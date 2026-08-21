"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { todayISO } from "@/lib/data/billing"
import {
  acharIndicadorPorCodigo,
  nomeDoIndicador,
  normalizarCodigo,
} from "@/lib/data/indicacoes"
import { enviarEmail } from "@/lib/email/enviar"
import { novoClienteInterno } from "@/lib/email/templates"

export type SignUpState = {
  ok: boolean
  message?: string
  /** true = criado, falta confirmar o e-mail (tela "confira sua caixa"). */
  needsConfirmation?: boolean
  email?: string
}

/** slug seguro pra holding/brand a partir do nome da empresa. */
function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return base || "empresa"
}

/** Hoje + N dias (America/Sao_Paulo), YYYY-MM-DD. */
function trialEndISO(days = 7): string {
  const base = new Date(`${todayISO()}T12:00:00-03:00`)
  base.setDate(base.getDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base)
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const nome = String(formData.get("nome") ?? "").trim()
  const empresa = String(formData.get("empresa") ?? "").trim()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const senha = String(formData.get("senha") ?? "")
  const whatsapp = String(formData.get("whatsapp") ?? "").trim()
  const cupom = String(formData.get("cupom") ?? "").trim()

  if (!nome || !empresa || !email || !senha)
    return { ok: false, message: "Preencha nome, empresa, e-mail e senha." }
  if (!email.includes("@") || email.length < 5)
    return { ok: false, message: "E-mail inválido." }
  if (senha.length < 6)
    return { ok: false, message: "A senha precisa de pelo menos 6 caracteres." }

  const hdrs = await headers()
  const host = hdrs.get("host") ?? "deliveryos.food"
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https")
  const origin = `${proto}://${host}`

  const supabase = await createClient()
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: nome, company: empresa, whatsapp: whatsapp || null },
    },
  })

  if (signUpErr) {
    const code = signUpErr.code ?? ""
    const m = signUpErr.message.toLowerCase()
    // SEMPRE loga: em 03/ago um cliente ficou dias sem conseguir entrar e o
    // erro real (SMTP recusando credencial, 535) só apareceu no log do Supabase
    // porque aqui a gente devolvia "tenta de novo" sem registrar nada.
    console.error(
      `[cadastro] signUp falhou · code=${code || "(vazio)"} · status=${
        signUpErr.status ?? "?"
      } · ${signUpErr.message}`,
    )
    if (
      code === "user_already_exists" ||
      m.includes("already") ||
      m.includes("registered")
    )
      return await jaTemConta(supabase, email, origin)
    if (code === "weak_password" || m.includes("weak") || m.includes("leaked"))
      return {
        ok: false,
        message:
          "Essa senha aparece em vazamentos conhecidos — escolha uma mais difícil de adivinhar.",
      }
    if (m.includes("at least") || m.includes("characters"))
      return { ok: false, message: "Senha muito curta — use pelo menos 6 caracteres." }
    if (code === "over_email_send_rate_limit" || m.includes("rate limit"))
      return {
        ok: false,
        message: "Muitas tentativas agora. Espera um minuto e tenta de novo.",
      }
    // 500 do Supabase = falha NOSSA (foi assim que o SMTP recusado derrubou o
    // cadastro por dias). Não mandar o cliente "tentar de novo": tentar de novo
    // não conserta, e ele fica achando que errou alguma coisa.
    if (code === "unexpected_failure" || (signUpErr.status ?? 0) >= 500)
      return {
        ok: false,
        message:
          "Nosso envio de e-mail está com problema — a falha é nossa, não sua. Já fomos avisados. Chame no WhatsApp que a gente libera seu acesso na hora.",
      }
    return { ok: false, message: "Não foi possível criar a conta. Tenta de novo." }
  }

  // Anti-enumeração do Supabase: e-mail já existente volta com identities
  // vazio (sem erro). Mesmo tratamento do "já existe".
  if (
    signUpData.user &&
    Array.isArray(signUpData.user.identities) &&
    signUpData.user.identities.length === 0
  ) {
    return await jaTemConta(supabase, email, origin)
  }
  const userId = signUpData.user?.id
  if (!userId)
    return { ok: false, message: "Não foi possível criar a conta. Tenta de novo." }

  // Cria a empresa (holding) + marca + acesso admin + trial de 7 dias.
  const admin = createAdminClient()
  const slugBase = slugify(empresa)
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`

  // Cupom de indicação. Inválido NÃO barra o cadastro: o cliente entra sem
  // desconto e o caso se resolve depois. Perder a venda por causa de um
  // código digitado errado seria o pior desfecho possível.
  const indicador = cupom ? await acharIndicadorPorCodigo(cupom) : null

  const { data: holding, error: hErr } = await admin
    .from("holdings")
    .insert({
      name: empresa,
      slug,
      paid: false,
      trial_ends_at: trialEndISO(7),
      indicado_por: indicador?.id ?? null,
      indicado_em: indicador ? new Date().toISOString() : null,
      desconto_primeira_fatura_pct: indicador?.descontoPct ?? null,
    })
    .select("id")
    .single()
  if (hErr || !holding)
    return {
      ok: false,
      message: "Erro ao criar sua empresa. Tenta de novo em instantes.",
    }

  await admin
    .from("brands")
    .insert({ holding_id: holding.id, name: empresa, slug: slugBase })

  await admin.from("user_unit_access").insert({
    user_id: userId,
    scope_type: "holding",
    scope_id: holding.id,
    role: "admin",
  })

  await admin
    .from("profiles")
    .update({ full_name: nome, perfil: "administrador", onboarded: false })
    .eq("user_id", userId)

  /* Avisa a casa que entrou gente. O teste são 7 dias: descobrir o cadastro
   * dois dias depois já queimou um terço da janela de conversar com a pessoa.
   *
   * Nunca derruba o cadastro: se o e-mail falhar, o cliente entra do mesmo
   * jeito e nós perdemos o aviso — nunca o contrário. */
  try {
    const { assunto, html } = novoClienteInterno({
      empresa,
      nome,
      email,
      whatsapp: whatsapp || null,
      cupom: indicador ? normalizarCodigo(cupom) : null,
      indicador: indicador ? await nomeDoIndicador(indicador.id) : null,
      diasDeTeste: 7,
    })
    await enviarEmail({
      holdingId: holding.id,
      tipo: "cliente-novo",
      para: process.env.SAUDE_EMAIL ?? "marcus@massarenti.me",
      assunto,
      html,
      forcar: true,
    })
  } catch (e) {
    console.error("[cadastro] aviso de cliente novo falhou:", e)
  }

  // Se o projeto NÃO exige confirmação de e-mail, o Supabase já devolve sessão
  // → entra direto. Se exige, não há sessão → tela "confira seu e-mail".
  if (signUpData.session) {
    redirect("/inicio")
  }
  redirect(`/cadastro/confirme?email=${encodeURIComponent(email)}`)
}

/**
 * E-mail já cadastrado — em vez de beco sem saída, REENVIA a confirmação.
 *
 * O caso real (03/ago/26): cliente se cadastrou em 27/jul, não confirmou a
 * tempo, e o link venceu. Ao tentar de novo, ouvia "Esse e-mail já tem conta,
 * faça login" — mas login ele não conseguia, justamente por não ter
 * confirmado. Beco sem saída, e a única saída era APAGAR o usuário na mão.
 *
 * `resend` só funciona pra conta NÃO confirmada; em conta confirmada o
 * Supabase devolve erro, e aí sim "faça login" é a resposta certa. Ou seja: a
 * própria tentativa distingue os dois casos, sem precisar consultar o
 * auth.users nem expor se o e-mail existe.
 *
 * Também não recria empresa/marca/acesso: eles já existem do cadastro
 * anterior, e cadastrar de novo duplicaria tudo.
 */
async function jaTemConta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  origin: string,
): Promise<SignUpState> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (!error) {
    redirect(
      `/cadastro/confirme?email=${encodeURIComponent(email)}&reenviado=1`,
    )
  }

  const m = error.message.toLowerCase()
  if ((error.code ?? "").includes("rate") || m.includes("rate limit"))
    return {
      ok: false,
      message:
        "Já mandamos um e-mail há pouco. Confira a caixa de entrada e o spam — se não achar, espera um minuto e tenta de novo.",
    }
  if ((error.status ?? 0) >= 500)
    return {
      ok: false,
      message:
        "Nosso envio de e-mail está com problema — a falha é nossa, não sua. Chame no WhatsApp que a gente libera seu acesso na hora.",
    }
  console.error(
    `[cadastro] resend falhou · code=${error.code ?? "(vazio)"} · ${error.message}`,
  )
  return { ok: false, message: "Esse e-mail já tem conta. Faça login." }
}

/** Reenvia o e-mail de confirmação (botão na tela /cadastro/confirme). */
export async function resendConfirmation(
  _prev: { ok: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email.includes("@")) return { ok: false, message: "E-mail inválido." }

  const hdrs = await headers()
  const host = hdrs.get("host") ?? "deliveryos.food"
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https")

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback` },
  })
  if (error) {
    if ((error.code ?? "").includes("rate") || error.message.toLowerCase().includes("rate"))
      return { ok: false, message: "Espera um minuto antes de reenviar." }
    return { ok: false, message: "Não foi possível reenviar agora." }
  }
  return { ok: true, message: "E-mail reenviado! Confira a caixa (e o spam)." }
}
