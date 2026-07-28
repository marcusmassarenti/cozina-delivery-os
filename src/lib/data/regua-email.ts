/**
 * A régua: decide, todo dia, quem recebe qual e-mail.
 *
 * Toda a proteção contra e-mail repetido está no índice único de
 * `email_enviados` (holding_id, tipo) — não em cálculo de data. Assim, se o
 * cron rodar duas vezes ou o horário escorregar (no plano Hobby a Vercel tem
 * tolerância de 59 min), ninguém recebe nada duas vezes.
 *
 * Conta interna nunca entra: mandar cobrança pra si mesmo é ruído.
 */
import "server-only"

import { enviarEmail, type TipoEmail } from "@/lib/email/enviar"
import {
  boasVindas,
  faturaVencida,
  faturaVencendo,
  recuperacao,
  trial3Dias,
  trialTerminou,
  type DadosEmail,
} from "@/lib/email/templates"
import { createAdminClient } from "@/lib/supabase/admin"
import { getDefaultPlan, precoDoPlano, type PlanId } from "@/lib/data/assinatura"

const hojeISO = () => new Date().toISOString().slice(0, 10)
const fmtData = (iso: string) => {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}
function diasEntre(de: string, ate: string): number {
  const ms = new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()
  return Math.round(ms / 86400000)
}

export type ResultadoRegua = {
  enviados: { cliente: string; tipo: string; para: string }[]
  falhas: { cliente: string; tipo: string; erro: string }[]
  semEmail: string[]
}

export async function rodarReguaEmail(): Promise<ResultadoRegua> {
  const admin = createAdminClient()
  const hoje = hojeISO()
  const out: ResultadoRegua = { enviados: [], falhas: [], semEmail: [] }

  const { data: holdings } = await admin
    .from("holdings")
    .select(
      "id, name, created_at, trial_ends_at, paid, due_date, suspend_on, plan_tier, monthly_fee, price_per_unit, included_units, conta_interna",
    )
    .eq("conta_interna", false)

  if (!holdings?.length) return out

  // Contato de cada cliente: o admin da conta. Uma chamada só pro auth.
  const { data: acessos } = await admin
    .from("user_unit_access")
    .select("user_id, units!inner(brand_id, brands!inner(holding_id))")
  const usuariosPorHolding = new Map<string, Set<string>>()
  for (const a of (acessos ?? []) as unknown as {
    user_id: string
    units: { brands: { holding_id: string } }
  }[]) {
    const h = a.units?.brands?.holding_id
    if (!h) continue
    if (!usuariosPorHolding.has(h)) usuariosPorHolding.set(h, new Set())
    usuariosPorHolding.get(h)!.add(a.user_id)
  }

  const contato = new Map<string, { email: string; nome: string | null }>()
  try {
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const porId = new Map(
      (lista?.users ?? []).map((u) => [
        u.id,
        {
          email: u.email ?? "",
          nome: (u.user_metadata?.full_name as string | null) ?? null,
          confirmado: Boolean(u.email_confirmed_at),
          company: (u.user_metadata?.company as string | null) ?? null,
        },
      ]),
    )
    for (const h of holdings as { id: string; name: string }[]) {
      // Preferência: usuário com e-mail CONFIRMADO. Mandar régua pra quem nem
      // confirmou o cadastro é queimar reputação de domínio à toa.
      let escolhido: { email: string; nome: string | null } | null = null
      for (const uid of usuariosPorHolding.get(h.id) ?? []) {
        const u = porId.get(uid)
        if (u?.email && u.confirmado) {
          escolhido = { email: u.email, nome: u.nome }
          break
        }
      }
      // Sem acesso mapeado (cliente que nunca cadastrou loja): casa pelo nome
      // da empresa gravado no metadata do cadastro.
      if (!escolhido) {
        for (const [, u] of porId) {
          if (u.confirmado && u.company && u.company === h.name) {
            escolhido = { email: u.email, nome: u.nome }
            break
          }
        }
      }
      if (escolhido) contato.set(h.id, escolhido)
    }
  } catch (e) {
    console.error("regua-email: listUsers falhou", e)
  }

  const precos = await getDefaultPlan()

  // Lojas ativas por cliente — decide o texto do boas-vindas e o valor.
  const { data: brands } = await admin.from("brands").select("id, holding_id")
  const holdingPorBrand = new Map(
    ((brands ?? []) as { id: string; holding_id: string }[]).map((b) => [b.id, b.holding_id]),
  )
  const { data: units } = await admin.from("units").select("brand_id, active").eq("active", true)
  const lojasPorHolding = new Map<string, number>()
  for (const u of (units ?? []) as { brand_id: string }[]) {
    const h = holdingPorBrand.get(u.brand_id)
    if (h) lojasPorHolding.set(h, (lojasPorHolding.get(h) ?? 0) + 1)
  }

  for (const h of holdings as Record<string, unknown>[]) {
    const id = String(h.id)
    const nome = String(h.name)
    const c = contato.get(id)
    if (!c?.email) {
      out.semEmail.push(nome)
      continue
    }

    const lojas = lojasPorHolding.get(id) ?? 0
    const plano = (h.plan_tier as PlanId | null) ?? null
    const valorMensal = plano
      ? h.monthly_fee != null
        ? Number(h.monthly_fee) +
          Math.max(0, lojas - Number(h.included_units ?? 1)) * Number(h.price_per_unit ?? 0)
        : precoDoPlano(precos, plano, lojas)
      : undefined

    const dados: DadosEmail = {
      nome: c.nome,
      empresa: nome,
      temLoja: lojas > 0,
      valorMensal,
    }

    // UM e-mail por cliente por rodada. Sem isso, ao ligar a régua um cliente
    // com histórico levaria boas-vindas + fim de teste + recuperação + cobrança
    // no mesmo minuto — que é a forma mais rápida de queimar domínio novo e
    // virar spam. Como as regras estão em ordem de prioridade (boas-vindas
    // antes de cobrança), o primeiro que casar é o que faz sentido hoje; o
    // resto sai nos dias seguintes, um por dia.
    let jaMandouHoje = false
    const disparar = async (tipo: TipoEmail, msg: { assunto: string; html: string }) => {
      if (jaMandouHoje) return
      const r = await enviarEmail({
        holdingId: id,
        tipo,
        para: c.email,
        assunto: msg.assunto,
        html: msg.html,
      })
      if (r.jaEnviado) return
      jaMandouHoje = true
      if (r.ok) out.enviados.push({ cliente: nome, tipo, para: c.email })
      else out.falhas.push({ cliente: nome, tipo, erro: r.erro ?? "?" })
    }

    const trialFim = h.trial_ends_at ? String(h.trial_ends_at) : null
    const pago = Boolean(h.paid)

    // 1) Boas-vindas — todo cliente com e-mail confirmado recebe uma vez.
    await disparar("boas-vindas", boasVindas(dados))

    if (trialFim && !pago) {
      const faltam = diasEntre(hoje, trialFim)

      // 2) Reta final do teste. Janela de 1 a 3 dias (e não "== 3") porque no
      //    Hobby o cron pode escorregar quase uma hora e pular o dia exato.
      if (faltam >= 1 && faltam <= 3) {
        await disparar("trial-3-dias", trial3Dias({ ...dados, diasRestantes: faltam }))
      }

      // 3) Acabou.
      if (faltam <= 0) {
        await disparar("trial-terminou", trialTerminou(dados))

        // 4-7) Recuperação a cada 15 dias depois do fim do teste.
        const desde = -faltam
        const etapa = desde >= 60 ? 4 : desde >= 45 ? 3 : desde >= 30 ? 2 : desde >= 15 ? 1 : 0
        if (etapa > 0) {
          await disparar(
            `recuperacao-${etapa}` as TipoEmail,
            recuperacao(etapa as 1 | 2 | 3 | 4, dados),
          )
        }
      }
    }

    // 8) Cobrança de quem já é cliente pagante.
    const venc = h.due_date ? String(h.due_date) : null
    if (venc && plano) {
      const faltamPraVencer = diasEntre(hoje, venc)
      if (pago && faltamPraVencer >= 1 && faltamPraVencer <= 3) {
        await disparar(
          "fatura-vencendo",
          faturaVencendo({ ...dados, vencimento: fmtData(venc) }),
        )
      }
      if (!pago && faltamPraVencer < 0) {
        await disparar(
          "fatura-vencida",
          faturaVencida({
            ...dados,
            vencimento: fmtData(venc),
            suspendeEm: h.suspend_on ? fmtData(String(h.suspend_on)) : undefined,
          }),
        )
      }
    }
  }

  return out
}
