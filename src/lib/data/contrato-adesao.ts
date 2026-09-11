import "server-only"

/**
 * O Termo de Adesão — o contrato que nasce quando o cliente assina sozinho.
 *
 * ── O CICLO DE VIDA ──────────────────────────────────────────────────────
 *   aceito    → o cliente marcou o aceite no checkout. Grava ANTES de criar a
 *               cobrança no Asaas: se a gravação falhar, nada é cobrado.
 *   vigente   → o primeiro pagamento confirmou (webhook). É aqui que o e-mail
 *               com o termo sai — mandar contrato de uma assinatura cujo
 *               cartão foi recusado seria ruído, e ruído vira spam.
 *   cancelado → a cobrança não chegou a existir, ou o cliente desistiu antes
 *               de pagar.
 *
 * ── O QUE FAZ ESTE ACEITE VALER ──────────────────────────────────────────
 * O mesmo da proposta (Lei 14.063/2020, art. 4º, I): identidade, circunstância
 * e integridade. Aqui a identidade é até mais forte — quem aceita está LOGADO,
 * então o termo guarda o usuário da conta, e não só um nome digitado. Data, IP
 * e hash são calculados no servidor; nada disso vem do navegador.
 */
import { createHash, randomBytes } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { canonico } from "@/lib/data/hash-canonico"
import {
  CONTRATO_VERSAO,
  brl,
  condicoesDoTermo,
  dataBR,
  rotuloCicloAdesao,
  type DadosAdesao,
} from "@/lib/contrato-adesao-texto"

export type StatusAdesao = "aceito" | "vigente" | "cancelado"

export type Adesao = {
  id: string
  numero: string
  token: string
  holdingId: string
  status: StatusAdesao
  dados: DadosAdesao
  versaoContrato: string
  hash: string
  aceite: {
    nome: string
    email: string
    ip: string
    userAgent: string
    em: string
  }
  vigenteEm: string | null
  enviadoEm: string | null
}

const COLUNAS =
  "id, numero, token, holding_id, status, dados, versao_contrato, hash, aceite_nome, aceite_email, aceite_ip, aceite_user_agent, aceito_em, vigente_em, enviado_em"

function montar(r: Record<string, unknown>): Adesao {
  return {
    id: r.id as string,
    numero: r.numero as string,
    token: r.token as string,
    holdingId: r.holding_id as string,
    status: r.status as StatusAdesao,
    dados: r.dados as DadosAdesao,
    versaoContrato: r.versao_contrato as string,
    hash: r.hash as string,
    aceite: {
      nome: (r.aceite_nome as string | null) ?? "",
      email: (r.aceite_email as string | null) ?? "",
      ip: (r.aceite_ip as string | null) ?? "",
      userAgent: (r.aceite_user_agent as string | null) ?? "",
      em: r.aceito_em as string,
    },
    vigenteEm: (r.vigente_em as string | null) ?? null,
    enviadoEm: (r.enviado_em as string | null) ?? null,
  }
}

/**
 * SHA-256 do que o cliente aceitou: o número, a versão do contrato-mestre, o
 * quadro-resumo e as condições JÁ ESCRITAS. O texto das condições entra no
 * hash (e não só os dados) porque é ele que a pessoa leu.
 */
export function hashAdesao(
  numero: string,
  versaoContrato: string,
  dados: DadosAdesao,
): string {
  return createHash("sha256")
    .update(
      canonico({
        numero,
        versaoContrato,
        dados,
        condicoes: condicoesDoTermo(dados),
      }),
    )
    .digest("hex")
}

/** "TA-2026-0001" — Termo de Adesão, ano, sequência do ano. */
async function proximoNumero(): Promise<string> {
  const ano = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).slice(0, 4)
  const { data } = await createAdminClient()
    .from("contratos_assinatura")
    .select("numero")
    .like("numero", `TA-${ano}-%`)
    .order("numero", { ascending: false })
    .limit(1)
  const ultimo = (data ?? [])[0]?.numero as string | undefined
  const n = ultimo ? Number(ultimo.split("-")[2]) + 1 : 1
  return `TA-${ano}-${String(n).padStart(4, "0")}`
}

/**
 * Grava o aceite. É o ato jurídico do checkout — daí rodar ANTES da cobrança:
 * sem o registro do aceite, a cobrança não é criada.
 *
 * O número é único no banco. Dois clientes assinando no mesmo segundo pegariam
 * o mesmo "próximo", e o segundo levaria 23505 — então tenta de novo, que o
 * próximo "próximo" já é outro.
 */
export async function registrarAdesao(input: {
  holdingId: string
  dados: DadosAdesao
  userId: string
  nome: string
  email: string
  ip: string
  userAgent: string
}): Promise<{ ok: true; id: string; numero: string } | { ok: false; erro: string }> {
  const admin = createAdminClient()
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const numero = await proximoNumero()
    const { data, error } = await admin
      .from("contratos_assinatura")
      .insert({
        numero,
        holding_id: input.holdingId,
        token: randomBytes(24).toString("base64url"),
        status: "aceito",
        dados: input.dados,
        versao_contrato: CONTRATO_VERSAO,
        hash: hashAdesao(numero, CONTRATO_VERSAO, input.dados),
        aceite_user_id: input.userId,
        aceite_nome: input.nome,
        aceite_email: input.email,
        aceite_ip: input.ip,
        aceite_user_agent: input.userAgent.slice(0, 500),
      })
      .select("id, numero")
      .maybeSingle()
    if (!error && data) return { ok: true, id: data.id as string, numero }
    if (error?.code !== "23505")
      return { ok: false, erro: error?.message ?? "Não foi possível registrar o aceite." }
  }
  return { ok: false, erro: "Não foi possível numerar o termo. Tente de novo." }
}

/** Amarra o termo à assinatura/parcelamento que ele originou. */
export async function vincularAdesaoAoAsaas(id: string, asaasRef: string): Promise<void> {
  await createAdminClient()
    .from("contratos_assinatura")
    .update({ asaas_ref: asaasRef })
    .eq("id", id)
}

/** A cobrança não chegou a ser criada: o aceite fica registrado, mas sem efeito. */
export async function cancelarAdesao(id: string): Promise<void> {
  await createAdminClient()
    .from("contratos_assinatura")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("status", "aceito")
}

/** Desistiu antes de pagar: todo termo ainda não vigente da empresa perde efeito. */
export async function cancelarAdesoesPendentes(holdingId: string): Promise<void> {
  await createAdminClient()
    .from("contratos_assinatura")
    .update({ status: "cancelado" })
    .eq("holding_id", holdingId)
    .eq("status", "aceito")
}

/**
 * O termo do link público. Cancelado cai no mesmo "não encontrado" de token
 * errado: ele nunca vigorou, e não há o que mostrar.
 */
export async function getAdesaoPorToken(token: string): Promise<Adesao | null> {
  if (!token || token.length < 20) return null
  const { data } = await createAdminClient()
    .from("contratos_assinatura")
    .select(COLUNAS)
    .eq("token", token)
    .maybeSingle()
  if (!data) return null
  const a = montar(data as Record<string, unknown>)
  return a.status === "cancelado" ? null : a
}

/** O termo em vigor (ou o recém-aceito) da empresa — pra tela de Assinatura. */
export async function getAdesaoAtual(holdingId: string): Promise<Adesao | null> {
  const { data } = await createAdminClient()
    .from("contratos_assinatura")
    .select(COLUNAS)
    .eq("holding_id", holdingId)
    .in("status", ["vigente", "aceito"])
    .order("aceito_em", { ascending: false })
    .limit(1)
  const r = (data ?? [])[0]
  return r ? montar(r as Record<string, unknown>) : null
}

/**
 * Pagamento confirmado → o termo entra em vigor e vai por e-mail.
 *
 * Chamado pelo webhook em TODA confirmação. A condição `status = 'aceito'` no
 * próprio UPDATE é o que garante um e-mail só: no 12x chegam doze confirmações
 * de uma vez, e só a primeira encontra o termo ainda "aceito".
 *
 * Nunca lança. O webhook libera o acesso do cliente; um e-mail que falhou não
 * pode desfazer isso nem fazer o Asaas reenviar o evento.
 */
export async function ativarAdesaoEEnviar(holdingId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: pend } = await admin
      .from("contratos_assinatura")
      .select(COLUNAS)
      .eq("holding_id", holdingId)
      .eq("status", "aceito")
      .order("aceito_em", { ascending: false })
      .limit(1)
    const r = (pend ?? [])[0]
    if (!r) return
    const a = montar(r as Record<string, unknown>)

    const agora = new Date().toISOString()
    const { data: virou } = await admin
      .from("contratos_assinatura")
      .update({ status: "vigente", vigente_em: agora })
      .eq("id", a.id)
      .eq("status", "aceito")
      .select("id")
    if (!virou || virou.length === 0) return

    // Tentativas anteriores que nunca foram pagas não vigoram ao lado desta.
    await admin
      .from("contratos_assinatura")
      .update({ status: "cancelado" })
      .eq("holding_id", holdingId)
      .eq("status", "aceito")

    if (!a.aceite.email) return

    const { data: h } = await admin
      .from("holdings")
      .select("name")
      .eq("id", holdingId)
      .maybeSingle()
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { termoAdesao } = await import("@/lib/email/templates")
    const d = a.dados
    const email = termoAdesao({
      numero: a.numero,
      token: a.token,
      nome: a.aceite.nome || null,
      empresa: (h?.name as string | undefined) ?? d.contratante.nome,
      plano: d.plano.nome,
      lojas: d.lojas,
      ciclo: rotuloCicloAdesao(d),
      valor:
        !d.plano.personalizado && d.ciclo === "anual_12x"
          ? `${d.parcelas ?? 12}x de ${brl(d.valorMensal)} (total ${brl(d.valorCiclo)})`
          : !d.plano.personalizado && d.ciclo === "anual"
            ? `${brl(d.valorCiclo)} à vista por 12 meses`
            : `${brl(d.valorMensal)} por mês`,
      inicio: dataBR(d.inicio),
      aceitoPor: a.aceite.nome,
      email: a.aceite.email,
      quando: new Date(a.aceite.em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }),
      ip: a.aceite.ip,
      hash: a.hash,
    })
    const r2 = await enviarEmail({
      holdingId,
      tipo: "termo-adesao",
      para: a.aceite.email,
      assunto: email.assunto,
      html: email.html,
      // Um cliente pode aderir mais de uma vez na vida (cancelou e voltou):
      // sem forçar, a trava por (cliente, tipo) engoliria o segundo termo.
      forcar: true,
    })
    if (r2.ok && !r2.jaEnviado) {
      await admin
        .from("contratos_assinatura")
        .update({ enviado_em: new Date().toISOString() })
        .eq("id", a.id)
    }
  } catch (e) {
    console.error("[termo de adesão] ativar/enviar:", e)
  }
}
