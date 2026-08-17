import "server-only"

/**
 * Aceite eletrônico da proposta — o link público, a prova e o hash.
 *
 * ── O QUE FAZ ESTE ACEITE VALER ──────────────────────────────────────────
 * A Lei 14.063/2020 (art. 4º, I) admite a assinatura eletrônica SIMPLES quando
 * ela identifica o signatário e anexa dados que permitam verificar a
 * integridade do documento. É o que está aqui: identidade (nome, CPF, cargo,
 * e-mail), circunstância (IP, navegador, data/hora do servidor) e integridade
 * (SHA-256 do documento). Entre duas empresas privadas isso é prova de que o
 * contrato foi aceito — certificado ICP-Brasil só entra quando a lei exige
 * forma específica, o que não é o caso de um contrato de SaaS.
 *
 * ⚠️ NADA DISSO VEM DO NAVEGADOR, exceto o que a pessoa digita.
 * O hash é calculado aqui a partir do que está GRAVADO, a data é a do servidor
 * e o IP vem do cabeçalho da Vercel. Se o hash viesse do cliente, ele provaria
 * apenas que o cliente sabe mandar um hash.
 */
import { createHash, randomBytes } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { getModeloProposta, type ModeloProposta } from "@/lib/data/proposta-modelo"
import {
  completarDadosPublico,
  montarAceite,
  type AceiteProposta,
  type DadosProposta,
  type StatusProposta,
} from "@/lib/data/propostas"

/** A proposta como o CLIENTE a vê no link público. */
export type PropostaPublica = {
  id: string
  numero: string
  status: StatusProposta
  dados: DadosProposta
  modelo: ModeloProposta
  aceite: AceiteProposta | null
  recusadaEm: string | null
}

/**
 * JSON canônico: mesma entrada, mesma string, sempre.
 *
 * Sem ordenar as chaves o hash mudaria conforme a ordem em que o Postgres
 * devolvesse o JSONB — e um hash que muda sozinho não prova integridade
 * nenhuma, só gera a suspeita de adulteração que ele deveria afastar.
 */
function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`
  const o = v as Record<string, unknown>
  const chaves = Object.keys(o).sort()
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`
}

/** SHA-256 do conteúdo do documento: o que a pessoa leu e aceitou. */
export function hashDocumento(
  numero: string,
  dados: DadosProposta,
  modelo: ModeloProposta,
): string {
  return createHash("sha256")
    .update(canonico({ numero, dados, modelo }))
    .digest("hex")
}

/**
 * Valida CPF ou CNPJ pelos dígitos verificadores.
 *
 * Não é burocracia: o CPF é metade da identificação do signatário, e um dígito
 * trocado transforma a prova em "um número que não existe". Melhor recusar na
 * hora do que descobrir na discussão.
 */
export function docValido(bruto: string): boolean {
  const n = bruto.replace(/\D/g, "")
  if (n.length === 11) {
    if (/^(\d)\1{10}$/.test(n)) return false
    for (const [ate, pos] of [[9, 10] as const, [10, 11] as const]) {
      let s = 0
      for (let i = 0; i < ate; i++) s += Number(n[i]) * (pos - i)
      const d = ((s * 10) % 11) % 10
      if (d !== Number(n[ate])) return false
    }
    return true
  }
  if (n.length === 14) {
    if (/^(\d)\1{13}$/.test(n)) return false
    const calc = (ate: number) => {
      const pesos =
        ate === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      let s = 0
      for (let i = 0; i < ate; i++) s += Number(n[i]) * pesos[i]
      const r = s % 11
      return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(n[12]) && calc(13) === Number(n[13])
  }
  return false
}

export function fmtDoc(bruto: string): string {
  const n = (bruto ?? "").replace(/\D/g, "")
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  if (n.length === 14)
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  return bruto ?? ""
}

/**
 * Cria (ou devolve) o link público da proposta.
 *
 * Idempotente de propósito: quem clica duas vezes no botão não pode invalidar
 * o link que já mandou pro cliente por WhatsApp.
 */
export async function gerarTokenPublico(id: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("propostas")
    .select("token_publico")
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const atual = (data as { token_publico: string | null }).token_publico
  if (atual) return atual

  const token = randomBytes(24).toString("base64url")
  const { error } = await admin
    .from("propostas")
    .update({ token_publico: token, updated_at: new Date().toISOString() })
    .eq("id", id)
  return error ? null : token
}

const COLUNAS =
  "id, numero, status, dados, modelo_snapshot, signatario_nome, signatario_cpf, signatario_cargo, signatario_email, aceite_ip, aceite_user_agent, aceite_hash, assinada_em, recusada_em"

/**
 * A proposta do link público.
 *
 * ⚠️ Depois de aceita, os textos saem do SNAPSHOT e não do modelo atual —
 * senão editar "Quem somos" reescreveria o escopo de um documento já assinado.
 */
export async function getPropostaPorToken(
  token: string,
): Promise<PropostaPublica | null> {
  if (!token || token.length < 20) return null

  const { data } = await createAdminClient()
    .from("propostas")
    .select(COLUNAS)
    .eq("token_publico", token)
    .maybeSingle()
  if (!data) return null

  const p = data as unknown as Record<string, unknown>
  const snapshot = p.modelo_snapshot as ModeloProposta | null

  // Rascunho não tem link público válido: se o Marcus ainda está mexendo no
  // preço, o cliente não pode estar lendo a tela.
  const status = p.status as StatusProposta
  if (status === "rascunho" || status === "cancelada") return null

  return {
    id: p.id as string,
    numero: p.numero as string,
    status,
    dados: await completarDadosPublico(p.dados as Partial<DadosProposta>),
    modelo: snapshot ?? (await getModeloProposta()),
    aceite: montarAceite(p),
    recusadaEm: (p.recusada_em as string | null) ?? null,
  }
}

export type ResultadoAceite =
  | { ok: true }
  | { ok: false; erro: string }

/**
 * Registra o aceite. É o ato jurídico do sistema — daí a paranoia.
 *
 * A condição `status = 'enviada'` vai no PRÓPRIO update, não numa leitura
 * anterior: dois cliques simultâneos passariam os dois pela checagem e o
 * segundo sobrescreveria a prova do primeiro. Aqui o banco decide quem chegou.
 */
export async function registrarAceite(input: {
  token: string
  nome: string
  cpf: string
  cargo: string
  email: string
  ip: string
  userAgent: string
}): Promise<ResultadoAceite> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("propostas")
    .select("id, numero, status, dados, holding_id")
    .eq("token_publico", input.token)
    .maybeSingle()
  if (!data) return { ok: false, erro: "Proposta não encontrada." }

  const p = data as unknown as Record<string, unknown>
  if (p.status === "assinada") return { ok: false, erro: "Esta proposta já foi aceita." }
  if (p.status !== "enviada")
    return { ok: false, erro: "Esta proposta não está disponível para aceite." }

  // O modelo é lido AGORA e congelado junto: o hash tem que cobrir exatamente
  // os textos que foram exibidos, e o modelo pode mudar amanhã.
  const modelo = await getModeloProposta()
  const dados = await completarDadosPublico(p.dados as Partial<DadosProposta>)
  const hash = hashDocumento(p.numero as string, dados, modelo)
  const agora = new Date().toISOString()

  const { data: atualizada, error } = await admin
    .from("propostas")
    .update({
      status: "assinada",
      assinada_em: agora,
      updated_at: agora,
      modelo_snapshot: modelo,
      assinatura_provider: "sistema",
      signatario_nome: input.nome,
      signatario_cpf: input.cpf.replace(/\D/g, ""),
      signatario_cargo: input.cargo,
      signatario_email: input.email,
      aceite_ip: input.ip,
      aceite_user_agent: input.userAgent.slice(0, 500),
      aceite_hash: hash,
    })
    .eq("id", p.id as string)
    .eq("status", "enviada")
    .select("id")

  if (error) return { ok: false, erro: error.message }
  if (!atualizada || atualizada.length === 0)
    return { ok: false, erro: "Esta proposta já foi respondida." }

  return { ok: true }
}

/** Recusar também é resposta — sem isso a proposta fica "enviada" pra sempre. */
export async function registrarRecusa(
  token: string,
  motivo: string,
): Promise<ResultadoAceite> {
  const agora = new Date().toISOString()
  const { data, error } = await createAdminClient()
    .from("propostas")
    .update({
      status: "recusada",
      recusada_em: agora,
      recusa_motivo: motivo.slice(0, 500),
      updated_at: agora,
    })
    .eq("token_publico", token)
    .eq("status", "enviada")
    .select("id")

  if (error) return { ok: false, erro: error.message }
  if (!data || data.length === 0)
    return { ok: false, erro: "Esta proposta já foi respondida." }
  return { ok: true }
}
