import "server-only"

/**
 * Os números do aviso semanal de saúde que o CLIENTE vê ao entrar.
 *
 * Recorte deliberadamente pequeno: o painel de saúde interno tem dezenas de
 * sinais, e o cliente precisa de três respostas. Quantas lojas pararam de
 * mandar dado, quantas nunca mandaram, e — a pergunta que só ele responde —
 * se o que falta é importar ou se a plataforma foi marcada por engano.
 *
 * ⚠️ A ÚLTIMA NÃO É DEDUTÍVEL PELO SISTEMA, e fingir que é seria o erro aqui.
 * Uma loja com Keeta marcada e zero dado pode ser "esqueci de subir a
 * planilha" ou "eu nunca vendi na Keeta". Só o dono sabe. Então o aviso não
 * chuta: separa o que dá pra afirmar (está conectada e o dado não vem × nunca
 * teve conexão nenhuma) e devolve a pergunta com os dois botões.
 */
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

import { agruparSaude, type LojaAgrupada } from "./saude-agrupada"
import { diagnosticarIntegracoes } from "./saude-integracoes"

export type AvisoSemanalSaude = {
  /** Semana ISO corrente ("2026-W32") — a chave do "já vi". */
  semana: string
  /** Lojas que mandavam dado e pararam. */
  precisamAtencao: LojaAgrupada[]
  /**
   * Marcações de plataforma que nunca receberam dado E não têm conexão —
   * ou falta importar, ou o cadastro está errado. Só o cliente sabe.
   */
  semDadoNunca: number
  /** Lojas distintas dentro de `semDadoNunca`. */
  semDadoLojas: number
  /** Marcações conectadas por API que ainda não trouxeram a primeira carga. */
  aguardandoPrimeiraCarga: number
  /** true = não há nada pra avisar; o pop-up nem monta. */
  vazio: boolean
}

/** Semana ISO (segunda a domingo) no fuso de São Paulo. */
export function semanaIso(d = new Date()): string {
  // Normaliza pro fuso antes de contar a semana: às 21h de domingo em São
  // Paulo o UTC já virou segunda, e o aviso apareceria um dia adiantado.
  const sp = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d) + "T00:00:00Z",
  )
  // Quinta-feira da mesma semana define o ano ISO (regra da norma).
  const alvo = new Date(sp)
  const diaIso = (sp.getUTCDay() + 6) % 7 // 0 = segunda
  alvo.setUTCDate(sp.getUTCDate() - diaIso + 3)
  const primeiraQuinta = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 4))
  const diaIsoJan4 = (primeiraQuinta.getUTCDay() + 6) % 7
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - diaIsoJan4 + 3)
  const semana =
    1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 86_400_000))
  return `${alvo.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`
}

export async function getAvisoSemanalSaude(): Promise<AvisoSemanalSaude> {
  const semana = semanaIso()
  const vazio: AvisoSemanalSaude = {
    semana,
    precisamAtencao: [],
    semDadoNunca: 0,
    semDadoLojas: 0,
    aguardandoPrimeiraCarga: 0,
    vazio: true,
  }

  // Escopo do usuário. `null` = superadmin/admin da holding, que vê tudo dela;
  // franqueado só enxerga as próprias lojas e não pode ser cobrado das outras.
  const acessiveis = await getAccessibleUnitIds()

  const s = await diagnosticarIntegracoes()
  const doEscopo =
    acessiveis === null ? s.lojas : s.lojas.filter((l) => acessiveis.includes(l.unitId))
  if (doEscopo.length === 0) return vazio

  const g = agruparSaude(doEscopo)
  const precisamAtencao = [...g.pararamHoje, ...g.seguemParadas]
    .flatMap((x) => x.lojas)
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))

  // "Nunca recebeu dado" se divide em dois, e a diferença muda quem age:
  // conectada = o sistema ainda vai trazer; sem conexão = precisa do cliente.
  const nunca = doEscopo.filter(
    (l) => l.gravidade !== "ok" && !l.ultimoPedido && !l.ultimoFinanceiro,
  )
  const semConexao = nunca.filter((l) => !l.conectada)
  const conectadas = nunca.filter((l) => l.conectada)

  const total =
    precisamAtencao.length + semConexao.length + conectadas.length
  if (total === 0) return vazio

  return {
    semana,
    precisamAtencao,
    semDadoNunca: semConexao.length,
    semDadoLojas: new Set(semConexao.map((l) => l.unitId)).size,
    aguardandoPrimeiraCarga: conectadas.length,
    vazio: false,
  }
}

/** A semana que o usuário logado já viu — `null` se nunca viu. */
export async function semanaVistaPeloUsuario(
  userId: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("saude_aviso_semana")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { saude_aviso_semana: string | null } | null)?.saude_aviso_semana ?? null
}
