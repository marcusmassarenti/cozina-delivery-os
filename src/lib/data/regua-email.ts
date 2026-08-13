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
  confirmarEmail,
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

  // ── Contato de cada cliente ────────────────────────────────────────────
  // Quem recebe é o ADMINISTRADOR da holding. Isso importa porque estes
  // e-mails cobram dinheiro: mandar "sua mensalidade venceu" pro gerente de
  // uma loja é constranger quem não decide nada sobre pagamento.
  //
  // ⚠️ user_unit_access NÃO tem foreign key nenhuma (conferido no banco), então
  // não dá pra pedir join ao PostgREST — a relação units/brands tem que ser
  // remontada aqui na mão. A versão anterior tentava `units!inner(...)`, o
  // PostgREST devolvia erro, o código lia só `data` e seguia com a lista
  // vazia. Resultado: ninguém era achado por acesso, só pelo nome da empresa
  // digitado no cadastro — que quebra calado se a holding for renomeada.
  const { data: brandsRel } = await admin.from("brands").select("id, holding_id")
  const holdingDaBrand = new Map(
    ((brandsRel ?? []) as { id: string; holding_id: string }[]).map((b) => [b.id, b.holding_id]),
  )
  const { data: unitsRel } = await admin.from("units").select("id, brand_id")
  const holdingDaUnit = new Map(
    ((unitsRel ?? []) as { id: string; brand_id: string }[])
      .map((u) => [u.id, holdingDaBrand.get(u.brand_id)])
      .filter((p): p is [string, string] => Boolean(p[1])),
  )

  const { data: acessos, error: erroAcessos } = await admin
    .from("user_unit_access")
    .select("user_id, scope_type, scope_id, role")
  if (erroAcessos) console.error("regua-email: acessos", erroAcessos.message)

  /** Menor número = melhor contato. */
  const prioridade = (scope: string, role: string) =>
    scope === "holding" && role === "admin" ? 1 : scope === "holding" ? 2 : 3

  const candidatos = new Map<string, { userId: string; peso: number }[]>()
  for (const a of (acessos ?? []) as {
    user_id: string
    scope_type: string
    scope_id: string
    role: string
  }[]) {
    const h =
      a.scope_type === "holding"
        ? a.scope_id
        : a.scope_type === "brand"
          ? holdingDaBrand.get(a.scope_id)
          : holdingDaUnit.get(a.scope_id)
    if (!h) continue
    if (!candidatos.has(h)) candidatos.set(h, [])
    candidatos.get(h)!.push({ userId: a.user_id, peso: prioridade(a.scope_type, a.role) })
  }

  const contato = new Map<string, { email: string; nome: string | null }>()
  /** Quem se cadastrou e nunca confirmou — vira régua de confirmação. */
  const pendentes = new Map<
    string,
    { email: string; nome: string | null; criadoEm: string }
  >()
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
          criadoEm: u.created_at,
        },
      ]),
    )

    for (const h of holdings as { id: string; name: string }[]) {
      // Empate de peso acontece de verdade (a Empreender tem 2 administradores).
      // Desempata pelo mais antigo: é quem abriu a conta e quem paga a fatura.
      // Sem isso a escolha ficaria na ordem que o banco devolveu — ou seja, um
      // dia a cobrança sai pra um sócio e no outro dia pra outro.
      const ordenados = (candidatos.get(h.id) ?? [])
        .slice()
        .sort(
          (a, b) =>
            a.peso - b.peso ||
            Date.parse(porId.get(a.userId)?.criadoEm ?? "") -
              Date.parse(porId.get(b.userId)?.criadoEm ?? ""),
        )

      const admConfirmado = ordenados
        .map((c) => porId.get(c.userId))
        .find((u) => u?.email && u.confirmado)
      if (admConfirmado) {
        contato.set(h.id, { email: admConfirmado.email, nome: admConfirmado.nome })
        continue
      }

      // Plano B: casar pelo nome da empresa gravado no cadastro. Cobre o
      // cliente que assinou mas ainda não teve acesso criado.
      const porEmpresa = [...porId.values()].find(
        (u) => u.confirmado && u.company && u.company === h.name,
      )
      if (porEmpresa) {
        contato.set(h.id, { email: porEmpresa.email, nome: porEmpresa.nome })
        continue
      }

      // Ninguém confirmado: guarda o não-confirmado pra régua de confirmação.
      const naoConfirmado =
        ordenados.map((c) => porId.get(c.userId)).find((u) => u?.email && !u.confirmado) ??
        [...porId.values()].find((u) => !u.confirmado && u.company && u.company === h.name)
      if (naoConfirmado) {
        pendentes.set(h.id, {
          email: naoConfirmado.email,
          nome: naoConfirmado.nome,
          criadoEm: naoConfirmado.criadoEm,
        })
      }
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

    // ── Nunca confirmou o e-mail ───────────────────────────────────────────
    // Sem confirmar, a pessoa não entra — então nenhuma outra régua faz
    // sentido pra ela. São 3 lembretes e acabou: é o único caso em que
    // escrevemos pra endereço não confirmado, e insistir mais que isso
    // machuca a reputação do domínio pra todos os outros clientes.
    if (!c?.email) {
      const p = pendentes.get(id)
      if (!p?.email) {
        out.semEmail.push(nome)
        continue
      }

      const dias = diasEntre(p.criadoEm.slice(0, 10), hoje)
      const etapa = dias >= 6 ? 3 : dias >= 3 ? 2 : dias >= 1 ? 1 : 0
      if (etapa === 0) continue

      // Link novo a cada lembrete: o do Supabase expira em 24h, então mandar
      // o mesmo de novo seria mandar um botão quebrado.
      // NÃO trocar por `generateLink(...).action_link`: manda botão morto.
      // Motivo completo em @/lib/auth/link-email.
      let link: string | null = null
      try {
        const { linkDeAuth } = await import("@/lib/auth/link-email")
        link = await linkDeAuth({
          tipo: "magiclink",
          email: p.email,
          next: "/inicio",
        })
      } catch (e) {
        console.error("regua-email: linkDeAuth", e)
      }
      if (!link) {
        out.falhas.push({ cliente: nome, tipo: `confirme-${etapa}`, erro: "não gerou o link" })
        continue
      }

      const tipo = `confirme-${etapa}` as TipoEmail
      const msg = confirmarEmail(etapa as 1 | 2 | 3, {
        nome: p.nome,
        empresa: nome,
        temLoja: false,
        link,
        diasDeTeste: dias,
      })
      const r = await enviarEmail({
        holdingId: id,
        tipo,
        para: p.email,
        assunto: msg.assunto,
        html: msg.html,
      })
      if (!r.jaEnviado) {
        if (r.ok) out.enviados.push({ cliente: nome, tipo, para: p.email })
        else out.falhas.push({ cliente: nome, tipo, erro: r.erro ?? "?" })
      }
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
      // TRÊS toques por ciclo: 5 dias, 2 dias e no dia do vencimento.
      //
      // Antes era um só, entre 1 e 3 dias, com o tipo fixo "fatura-vencendo" —
      // e a trava de duplicidade é (holding_id, tipo) SEM data. Resultado: o
      // lembrete saía UMA VEZ na vida do cliente e nunca mais. Mensalidade é
      // mensal; o aviso não era.
      //
      // Agora o tipo carrega a data do vencimento, então cada ciclo tem a
      // própria trava e o toque volta todo mês sem nunca repetir dentro do
      // mesmo ciclo.
      //
      // Sai mesmo com `paid = true`: quem paga por Pix/boleto fica marcado
      // como pago do ciclo ANTERIOR até alguém trocar na mão. Exigir
      // `!pago` era o que segurava o aviso justamente de quem mais precisa.
      const TOQUES = [
        { dias: 5, tipo: "fatura-5-dias" },
        { dias: 2, tipo: "fatura-2-dias" },
        { dias: 0, tipo: "fatura-vence-hoje" },
      ] as const
      const toque = TOQUES.find((t) => t.dias === faltamPraVencer)
      if (toque) {
        await disparar(
          `${toque.tipo}-${venc}` as TipoEmail,
          faturaVencendo({
            ...dados,
            vencimento: fmtData(venc),
            diasRestantes: faltamPraVencer,
            suspendeEm: h.suspend_on ? fmtData(String(h.suspend_on)) : undefined,
          }),
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
