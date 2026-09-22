import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { effectiveTrialEnd } from "@/lib/data/billing"

/**
 * Painel de ativação — em que etapa cada cliente NOVO parou (22/09/26).
 *
 * A régua de e-mail só reage a datas (teste acabando, fatura vencendo) e a
 * tela de Clientes mostrava status de cobrança — nada dizia "a Maracayá está
 * há 8 dias sem cadastrar loja". Maracayá e Master foods pararam no primeiro
 * dia e ninguém viu. Aqui a pergunta é outra: o que falta pra ESTE cliente
 * ver o primeiro número e assinar, e há quanto tempo ele está parado.
 *
 * Sem integração paga de WhatsApp no Delivery OS: o contato é o Marcus, pelo
 * WhatsApp dele, num clique — a mensagem já sai pronta pra etapa.
 */

export type EtapaAtivacao =
  | "sem_loja"
  | "sem_dado"
  | "sem_conexao"
  | "pronto_pra_assinar"
  | "assinou"

export type ClienteAtivacao = {
  holdingId: string
  empresa: string
  criadoEm: string
  diasDesdeCadastro: number
  /** Último acesso de QUALQUER usuário da conta (last_seen_at). */
  ultimoAcesso: string | null
  diasSemEntrar: number | null
  fimDoTeste: string | null
  pago: boolean
  lojas: number
  primeiraLoja: string | null
  temDado: boolean
  conectada: boolean
  /** Pedido de conexão do iFood em aberto: de quem é a vez. */
  ifoodEspera: "nossa" | "cliente" | null
  etapa: EtapaAtivacao
  contato: { nome: string | null; email: string | null; whatsapp: string | null }
  /** Link wa.me pro WhatsApp DO CLIENTE com a mensagem da etapa. */
  whatsappLink: string | null
}

const DIA = 24 * 60 * 60 * 1000

function dias(desde: string | null): number | null {
  if (!desde) return null
  return Math.max(0, Math.floor((Date.now() - Date.parse(desde)) / DIA))
}

/** Número brasileiro em formato wa.me (55 + DDD + número). */
function numeroWa(bruto: string | null): string | null {
  const d = (bruto ?? "").replace(/\D/g, "")
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d
  return null
}

function dataBr(iso: string | null): string {
  if (!iso) return ""
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

/** A mensagem de cada etapa — curta, em primeira pessoa, com a próxima ação. */
function mensagem(c: {
  nome: string | null
  empresa: string
  loja: string | null
  etapa: EtapaAtivacao
  fimDoTeste: string | null
}): string {
  const oi = `Oi${c.nome ? ` ${c.nome.split(" ")[0]}` : ""}! Aqui é o Marcus, do Delivery OS.`
  switch (c.etapa) {
    case "sem_loja":
      return `${oi} Vi que você criou a conta da ${c.empresa} — quer que eu te ajude a cadastrar a primeira loja? Leva 1 minuto e já te mostro seus números.`
    case "sem_dado":
      return `${oi} A ${c.loja ?? "sua loja"} já está cadastrada — falta só o primeiro relatório pra você ver faturamento, taxas e quanto sobra. Posso te ajudar agora? É só baixar o Financeiro do iFood e subir.`
    case "sem_conexao":
      return `${oi} Seus números da ${c.empresa} já estão no painel. Quer deixar tudo atualizando sozinho, sem planilha? Conectamos o iFood em até 24h — te passo o passo a passo.`
    case "pronto_pra_assinar":
      return `${oi} A ${c.empresa} já está com os números entrando sozinhos.${c.fimDoTeste ? ` Seu teste vai até ${dataBr(c.fimDoTeste)}` : ""} — quer que eu te mostre o que o sistema encontrou e te ajude a escolher o plano?`
    case "assinou":
      return `${oi} Tudo certo com o sistema por aí? Qualquer coisa que precisar, é só me chamar aqui.`
  }
}

type Linha = {
  holding_id: string
  empresa: string
  criado_em: string
  paid: boolean
  trial_ends_at: string | null
  lojas: number
  primeira_loja: string | null
  tem_dado: boolean
  conectada: boolean
  ifood_espera: "nossa" | "cliente" | null
  ultimo_acesso: string | null
  titular_nome: string | null
  titular_email: string | null
  titular_whatsapp: string | null
}

function montar(r: Linha): ClienteAtivacao {
  const pago = Boolean(r.paid)
  const etapa: EtapaAtivacao = pago
    ? "assinou"
    : r.lojas === 0
      ? "sem_loja"
      : !r.tem_dado && !r.conectada
        ? "sem_dado"
        : !r.conectada
          ? "sem_conexao"
          : "pronto_pra_assinar"
  const fimDoTeste = pago ? null : effectiveTrialEnd(r.trial_ends_at, r.criado_em)
  const wa = numeroWa(r.titular_whatsapp)
  return {
    holdingId: r.holding_id,
    empresa: r.empresa,
    criadoEm: r.criado_em,
    diasDesdeCadastro: dias(r.criado_em) ?? 0,
    ultimoAcesso: r.ultimo_acesso,
    diasSemEntrar: dias(r.ultimo_acesso),
    fimDoTeste,
    pago,
    lojas: r.lojas,
    primeiraLoja: r.primeira_loja,
    temDado: r.tem_dado,
    conectada: r.conectada,
    ifoodEspera: r.ifood_espera,
    etapa,
    contato: {
      nome: r.titular_nome,
      email: r.titular_email,
      whatsapp: r.titular_whatsapp,
    },
    whatsappLink: wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(
          mensagem({
            nome: r.titular_nome,
            empresa: r.empresa,
            loja: r.primeira_loja,
            etapa,
            fimDoTeste,
          }),
        )}`
      : null,
  }
}

/**
 * Clientes em ATIVAÇÃO: cadastrados nos últimos `janelaDias` e que ainda não
 * assinaram. Uma consulta só (RPC `ativacao_clientes`, migration 0262) — a
 * versão anterior fazia ~7 idas ao banco por cliente.
 *
 * Quem assinou sai (Marcus, 22/09/26): o painel é a fila de quem precisa de
 * um empurrão, não o histórico de quem já entrou.
 */
export async function getAtivacaoClientes(
  janelaDias = 60,
): Promise<ClienteAtivacao[]> {
  const { data, error } = await createAdminClient().rpc("ativacao_clientes", {
    p_desde: new Date(Date.now() - janelaDias * DIA).toISOString(),
  })
  if (error) {
    console.error("getAtivacaoClientes:", error.message)
    return []
  }
  return ((data ?? []) as Linha[]).map(montar).filter((c) => !c.pago)
}

/** A etapa e o WhatsApp de UM cliente — pra ficha do cliente. */
export async function getAtivacaoDoCliente(
  holdingId: string,
): Promise<ClienteAtivacao | null> {
  const { data, error } = await createAdminClient().rpc("ativacao_clientes", {
    p_desde: new Date(0).toISOString(),
    p_holding: holdingId,
  })
  if (error) {
    console.error("getAtivacaoDoCliente:", error.message)
    return null
  }
  const r = (data ?? [])[0] as Linha | undefined
  return r ? montar(r) : null
}
