/**
 * Clientes do Cardápio Web.
 *
 * É o dado que NENHUMA outra plataforma nossa entrega: iFood, 99 e Keeta
 * não abrem a base de clientes da loja. Aqui vem nome, telefone, e-mail,
 * aniversário, pontos de fidelidade e saldo de cashback.
 *
 * Limitação que define o desenho: a listagem não aceita filtro por data.
 * Não existe "só o que mudou" — toda atualização é varredura do começo,
 * 50 por página. Por isso a varredura é paginada com cursor: cada rodada
 * avança um pedaço e, ao terminar, volta pra página 1 (fidelidade e
 * cashback mudam sozinhos, então o cadastro precisa ser reciclado).
 *
 * O que NÃO vem aqui: endereço e histórico de pedidos. O endereço só
 * existe dentro do pedido (`delivery_address`), e a ligação cliente↔pedido
 * é pelo `order.customer.id` — que a gente guarda em
 * `cardapioweb_pedidos.customer_cw_id`.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { fetchCw } from "./client"
import type { CwInstall } from "./pedidos"

/** Teto da API: 50 por página em clientes (menor que os 100 de pedidos). */
const PER_PAGE = 50
/** Páginas por execução — 50 × 6 = 300 clientes por clique. */
const PAGINAS_POR_RODADA = 6

type CwCliente = {
  id?: number | string
  name?: string | null
  phone_number?: string | null
  ddi?: string | null
  email?: string | null
  birth_date?: string | null
  gender?: string | null
  created_at?: string | null
  loyalty_points?: number | null
  loyalty_points_expires_at?: string | null
  cashback_balance?: number | null
  cashback_expires_at?: string | null
  notifications_enabled?: boolean | null
}

type ClientesResponse = {
  customers?: CwCliente[]
  pagination?: {
    current_page?: number
    total_pages?: number
    total_customers?: number
  }
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

export type ResultadoClientes = {
  paginas: number
  clientes: number
  total: number | null
  proximaPagina: number
  voltou: boolean
  erro?: string
}

/**
 * Avança a varredura de clientes a partir do cursor guardado.
 *
 * Devolve `voltou: true` quando completou uma volta inteira e o cursor
 * reiniciou — sinal de que o cadastro está fresco.
 */
export async function sincronizarClientes(
  install: CwInstall,
  opts: { paginasPorRodada?: number } = {},
): Promise<ResultadoClientes> {
  const admin = createAdminClient()

  const { data: st } = await admin
    .from("cardapioweb_sync_state")
    .select("clientes_pagina, clientes_total")
    .eq("install_id", install.id)
    .maybeSingle()

  let pagina = (st?.clientes_pagina as number | undefined) ?? 1
  const limite = opts.paginasPorRodada ?? PAGINAS_POR_RODADA

  let paginasFeitas = 0
  let gravados = 0
  let total: number | null = (st?.clientes_total as number | null) ?? null
  let totalPaginas = 1
  let voltou = false
  let erro: string | undefined

  while (paginasFeitas < limite) {
    const res = await fetchCw<ClientesResponse>({
      installId: install.id,
      ambiente: install.ambiente,
      authMode: install.authMode,
      path: "/api/partner/v1/merchant/customers",
      endpointLabel: "GET /merchant/customers",
      query: { per_page: PER_PAGE, page: pagina },
    })

    if (!res.ok || !res.data) {
      erro = res.error ?? `HTTP ${res.status}`
      break
    }

    const lista = res.data.customers ?? []
    totalPaginas = res.data.pagination?.total_pages ?? 1
    total = res.data.pagination?.total_customers ?? total

    if (lista.length > 0) {
      const linhas = lista.map((c) => ({
        install_id: install.id,
        unit_id: install.unitId,
        customer_id: String(c.id),
        nome: str(c.name),
        email: str(c.email),
        telefone: str(c.phone_number),
        ddi: str(c.ddi),
        nascimento: c.birth_date ?? null,
        genero: str(c.gender),
        loyalty_points: num(c.loyalty_points),
        loyalty_points_expires_at: c.loyalty_points_expires_at ?? null,
        cashback_balance: num(c.cashback_balance),
        cashback_expires_at: c.cashback_expires_at ?? null,
        notifications_enabled: c.notifications_enabled ?? null,
        criado_em: c.created_at ?? null,
        synced_at: new Date().toISOString(),
      }))

      // Upsert de verdade (sem ignoreDuplicates): pontos e cashback mudam,
      // então a linha existente PRECISA ser atualizada.
      const { error } = await admin
        .from("cardapioweb_clientes")
        .upsert(linhas, { onConflict: "install_id,customer_id" })
      if (error) {
        erro = error.message
        break
      }
      gravados += linhas.length
    }

    paginasFeitas++
    pagina++

    if (pagina > totalPaginas) {
      pagina = 1
      voltou = true
      break
    }
  }

  // Monta o patch sem chaves undefined — `clientes_ultima_volta` só é
  // reescrito quando a varredura de fato fechou uma volta.
  const patch: Record<string, unknown> = {
    clientes_pagina: pagina,
    clientes_total: total,
    updated_at: new Date().toISOString(),
  }
  if (voltou) patch.clientes_ultima_volta = new Date().toISOString()

  await admin
    .from("cardapioweb_sync_state")
    .update(patch)
    .eq("install_id", install.id)

  return {
    paginas: paginasFeitas,
    clientes: gravados,
    total,
    proximaPagina: pagina,
    voltou,
    erro,
  }
}

// ─── Leitura pra tela ───────────────────────────────────────────────────

export type ResumoClientes = {
  total: number
  comCashback: number
  saldoCashback: number
  comPontos: number
  aniversariantesMes: number
  aceitamNotificacao: number
  novosNoMes: number
}

/** Números que a tela mostra — tudo calculado no banco, sem chamar a API. */
export async function getResumoClientes(
  installId: string,
): Promise<ResumoClientes> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_clientes")
    .select(
      "cashback_balance, loyalty_points, nascimento, notifications_enabled, criado_em",
    )
    .eq("install_id", installId)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const r: ResumoClientes = {
    total: 0,
    comCashback: 0,
    saldoCashback: 0,
    comPontos: 0,
    aniversariantesMes: 0,
    aceitamNotificacao: 0,
    novosNoMes: 0,
  }

  for (const c of data ?? []) {
    r.total++
    const cb = Number(c.cashback_balance) || 0
    if (cb > 0) {
      r.comCashback++
      r.saldoCashback += cb
    }
    if ((Number(c.loyalty_points) || 0) > 0) r.comPontos++
    if (c.notifications_enabled) r.aceitamNotificacao++
    if (c.nascimento) {
      // Só o MÊS importa — o ano de nascimento não muda a campanha.
      const m = Number(String(c.nascimento).slice(5, 7))
      if (m === mesAtual) r.aniversariantesMes++
    }
    if (c.criado_em) {
      const d = new Date(c.criado_em)
      if (
        d.getFullYear() === hoje.getFullYear() &&
        d.getMonth() === hoje.getMonth()
      ) {
        r.novosNoMes++
      }
    }
  }

  return r
}
