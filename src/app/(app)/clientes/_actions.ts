"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { guard, requireSuperadmin } from "@/lib/auth/guards"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { COOKIE_VER_COMO, VER_COMO_DURACAO_S } from "@/lib/auth/ver-como"
import { createAdminClient } from "@/lib/supabase/admin"
import { sincronizarValorAssinatura } from "@/lib/data/assinatura-sync"
import { auditar } from "@/lib/data/auditoria"
import { quitarFaturaComPagamento } from "@/lib/data/faturas"
import { acharIndicadorPorCodigo } from "@/lib/data/indicacoes"
import {
  asaasIsMock,
  asaasSetSubscriptionInvoiceSettings,
} from "@/lib/asaas/client"
import { fiscalInvoiceSettings } from "@/lib/asaas/fiscal"

export type CriarClienteState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (combining marks)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Provisiona um CLIENTE novo (super-admin only): cria empresa (holding) +
 * marca + 1ª loja + usuário admin vinculado. O admin do cliente entra com
 * is_superadmin=false (vê só a própria empresa). Sem migration — só inserts.
 *
 * Ordem: cria o usuário PRIMEIRO (falha mais comum = e-mail repetido). Se um
 * passo seguinte falhar, faz rollback best-effort (remove o que criou).
 */
export async function criarCliente(
  _prev: CriarClienteState,
  formData: FormData,
): Promise<CriarClienteState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()

    const empresa = String(formData.get("empresa") ?? "").trim()
    const adminNome = String(formData.get("adminNome") ?? "").trim()
    const adminEmail = String(formData.get("adminEmail") ?? "")
      .trim()
      .toLowerCase()
    const adminSenha = String(formData.get("adminSenha") ?? "")
    const lojaNome = String(formData.get("lojaNome") ?? "").trim()
    const lojaCidade = String(formData.get("lojaCidade") ?? "").trim()
    const lojaUf = String(formData.get("lojaUf") ?? "").trim().toUpperCase()
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const feeRaw = String(formData.get("monthlyFee") ?? "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
    const monthlyFee =
      feeRaw && !Number.isNaN(Number(feeRaw)) ? Number(feeRaw) : null
    const dueDate = dateOrNull(formData.get("dueDate"))

    const fieldErrors: Record<string, string> = {}
    if (!empresa) fieldErrors.empresa = "Nome da empresa obrigatório"
    if (!adminNome) fieldErrors.adminNome = "Nome do admin obrigatório"
    if (!adminEmail || !adminEmail.includes("@"))
      fieldErrors.adminEmail = "E-mail inválido"
    if (adminSenha.length < 6)
      fieldErrors.adminSenha = "Senha precisa de pelo menos 6 caracteres"
    if (!lojaNome) fieldErrors.lojaNome = "Nome da 1ª loja obrigatório"
    if (lojaUf && lojaUf.length !== 2) fieldErrors.lojaUf = "UF com 2 letras"
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
    }

    // slug único da holding (append -2, -3… se já existir)
    let slug = slugify(empresa) || "cliente"
    const { data: existing } = await admin
      .from("holdings")
      .select("slug")
      .like("slug", `${slug}%`)
    const taken = new Set((existing ?? []).map((h) => h.slug as string))
    if (taken.has(slug)) {
      let i = 2
      while (taken.has(`${slug}-${i}`)) i++
      slug = `${slug}-${i}`
    }

    // 1) usuário admin primeiro (falha comum: e-mail repetido)
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminSenha,
      email_confirm: true,
      user_metadata: { full_name: adminNome },
    })
    if (userErr || !created?.user) {
      return {
        ok: false,
        message: `Falha ao criar o usuário admin: ${
          userErr?.message ?? "erro desconhecido"
        }`,
      }
    }
    const newUserId = created.user.id

    let holdingId: string | null = null
    let brandId: string | null = null
    try {
      // 2) empresa (holding)
      const { data: holding, error: hErr } = await admin
        .from("holdings")
        .insert({
          name: empresa,
          slug,
          establishment_type: establishmentType,
          payment_method: paymentMethod,
          monthly_fee: monthlyFee,
          due_date: dueDate,
          paid: true,
          // Cliente provisionado pelo dono nasce no Pro (nunca sem plano) —
          // dá pra trocar depois no card "Plano & Nino AI" do detalhe.
          plan_tier: "pro",
        })
        .select("id")
        .single()
      if (hErr || !holding) throw new Error(hErr?.message ?? "Falha ao criar empresa")
      holdingId = holding.id

      // 3) marca (mesma identidade da empresa por ora)
      const { data: brand, error: bErr } = await admin
        .from("brands")
        .insert({
          holding_id: holding.id,
          name: empresa,
          slug: slugify(empresa) || "marca",
        })
        .select("id")
        .single()
      if (bErr || !brand) throw new Error(bErr?.message ?? "Falha ao criar marca")
      brandId = brand.id

      // 4) 1ª loja
      const { error: uErr } = await admin.from("units").insert({
        brand_id: brand.id,
        code: "01",
        name: lojaNome,
        city: lojaCidade || null,
        state: lojaUf || null,
        active: true,
      })
      if (uErr) throw new Error(`Falha ao criar a loja: ${uErr.message}`)

      // 5) profile do admin: perfil administrador, NÃO super-admin da plataforma
      const { error: pErr } = await admin.from("profiles").upsert(
        {
          user_id: newUserId,
          full_name: adminNome,
          perfil: "administrador",
          is_superadmin: false,
        },
        { onConflict: "user_id" },
      )
      if (pErr) throw new Error(`Falha no perfil: ${pErr.message}`)

      // 6) vínculo: admin da holding nova
      const { error: aErr } = await admin.from("user_unit_access").insert({
        user_id: newUserId,
        scope_type: "holding",
        scope_id: holding.id,
        role: "admin",
      })
      if (aErr) throw new Error(`Falha no vínculo de acesso: ${aErr.message}`)
    } catch (e) {
      // rollback best-effort (FK é restrict → apaga na ordem filho→pai)
      if (brandId) await admin.from("units").delete().eq("brand_id", brandId)
      if (brandId) await admin.from("brands").delete().eq("id", brandId)
      if (holdingId) await admin.from("holdings").delete().eq("id", holdingId)
      await admin.auth.admin.deleteUser(newUserId)
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Falha ao provisionar o cliente.",
      }
    }

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/clientes")
    return { ok: true }
  })
}

export type BillingActionState = { ok: boolean; message?: string }

/**
 * Desconto NEGOCIADO do cliente — as três formas num controle só.
 *
 * (Marcus, 21/08/26: "preciso poder fazer um ajuste manual de valor com um
 * cupom específico".)
 *
 * Não confundir com `desconto_primeira_fatura_pct`: aquele é o cupom de
 * INDICAÇÃO, cujo percentual quem define é o cliente que indicou, e que vale
 * uma vez só. Este é o que a gente combina na negociação.
 *
 * Os dois podem coexistir e a fatura aplica o negociado primeiro — ver a nota
 * em `faturas.ts`.
 */
export async function setDescontoNegociado(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, error: "Cliente não informado." }

    const tipo = String(formData.get("descontoTipo") ?? "").trim()
    // Vazio = tirar o desconto. Limpa tudo junto: valor órfão sem tipo viraria
    // desconto fantasma na próxima vez que alguém mexesse aqui.
    if (!tipo) {
      const { error } = await admin
        .from("holdings")
        .update({
          desconto_tipo: null,
          desconto_valor: null,
          desconto_ate: null,
          desconto_nota: null,
        })
        .eq("id", holdingId)
      if (error) return { ok: false, error: error.message }
      revalidatePath("/clientes")
      return { ok: true, message: "Desconto removido." }
    }

    if (tipo !== "percentual" && tipo !== "valor") {
      return { ok: false, error: "Tipo de desconto inválido." }
    }

    const bruto = String(formData.get("descontoValor") ?? "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
    const valor = bruto ? Number(bruto) : NaN
    if (!Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: "Informe o valor do desconto." }
    }
    // 100% é doar o plano — é uma decisão possível, mas acima disso é erro de
    // digitação, e desconto maior que o preço não vira crédito pro cliente.
    if (tipo === "percentual" && valor > 100) {
      return { ok: false, error: "Percentual não pode passar de 100." }
    }

    const ate = String(formData.get("descontoAte") ?? "").trim() || null
    const nota = String(formData.get("descontoNota") ?? "").trim() || null

    const { error } = await admin
      .from("holdings")
      .update({
        desconto_tipo: tipo,
        desconto_valor: valor,
        desconto_ate: ate,
        desconto_nota: nota,
      })
      .eq("id", holdingId)
    if (error) return { ok: false, error: error.message }

    revalidatePath("/clientes")
    return {
      ok: true,
      message: `Desconto de ${
        tipo === "percentual" ? `${valor}%` : `R$ ${valor.toFixed(2)}`
      } aplicado${ate ? ` até ${ate.split("-").reverse().join("/")}` : " (sem prazo)"}.`,
    }
  })
}

/** Salva o preço POR LOJA dos planos Essencial/Pro do self-service (super-admin). */
export async function setPlatformPlan(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const money = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".").trim()
      const n = raw ? Number(raw) : null
      return n != null && !Number.isNaN(n) && n >= 0 ? n : null
    }
    // Modelo "primeira loja + adicional": *_first e *_add por plano.
    const eF = money("essencial_first")
    const eA = money("essencial_add")
    const pF = money("pro_first")
    const pA = money("pro_add")
    const aF = money("ai_first")
    const aA = money("ai_add")
    const pacotePreco = money("pacotePreco") // pacote de perguntas do Consultor IA
    if (eF == null || eA == null)
      return { ok: false, message: "Informe os valores do Essencial (1ª loja e adicional)." }
    if (pF == null || pA == null)
      return { ok: false, message: "Informe os valores do Pro (1ª loja e adicional)." }
    if (aF == null || aA == null)
      return { ok: false, message: "Informe os valores do DeliveryOS AI (1ª loja e adicional)." }

    const { error } = await admin.from("platform_settings").upsert(
      {
        id: 1,
        // *_per_unit = primeira loja; *_add = cada loja adicional.
        essencial_per_unit: eF,
        essencial_add: eA,
        pro_per_unit: pF,
        pro_add: pA,
        ai_per_unit: aF,
        ai_add: aA,
        // Só sobrescreve o preço do pacote se veio no form.
        ...(pacotePreco != null ? { ia_pack_price: pacotePreco } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    if (error) return { ok: false, message: error.message }

    revalidatePath("/clientes")
    return { ok: true }
  })
}

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** Salva os dados de cobrança de um cliente (super-admin). */
export async function setClientBilling(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }

    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { ok: false, message: "Nome da empresa é obrigatório." }
    const establishmentType =
      String(formData.get("establishmentType") ?? "").trim() || null
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || null
    const money = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").replace(/\./g, "").replace(",", ".").trim()
      const n = raw ? Number(raw) : null
      return n != null && !Number.isNaN(n) ? n : null
    }
    const monthlyFee = money("monthlyFee")
    const pricePerUnit = money("pricePerUnit")
    const includedRaw = String(formData.get("includedUnits") ?? "").trim()
    const includedUnits =
      includedRaw && !Number.isNaN(Number(includedRaw))
        ? Math.max(0, Math.trunc(Number(includedRaw)))
        : 1
    const dueDate = dateOrNull(formData.get("dueDate"))
    const suspendOn = dateOrNull(formData.get("suspendOn"))
    const paid = formData.get("paid") === "on"
    // Forma de cobrança: só os 4 valores que o Asaas aceita. Qualquer outra
    // coisa vira null (= cartão, o padrão) em vez de estourar o CHECK do banco
    // — o form é um <select>, mas request forjado não é.
    const btRaw = String(formData.get("billingType") ?? "").trim()
    const billingType = ["CREDIT_CARD", "PIX", "BOLETO", "UNDEFINED"].includes(
      btRaw,
    )
      ? btRaw
      : null

    const { error } = await admin
      .from("holdings")
      .update({
        name,
        establishment_type: establishmentType,
        payment_method: paymentMethod,
        monthly_fee: monthlyFee,
        price_per_unit: pricePerUnit,
        included_units: includedUnits,
        due_date: dueDate,
        paid,
        suspend_on: suspendOn,
        asaas_billing_type: billingType,
      })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }

    revalidatePath("/clientes")
    revalidatePath("/", "layout")
    return { ok: true }
  })
}

/** Registra um pagamento recebido de um cliente (super-admin). */
export type ConviteAsaasState = {
  ok: boolean
  message?: string
  error?: string
  /** Link pra mandar pro cliente (WhatsApp). */
  link?: string
  /** Convite retirado. */
  removido?: boolean
}

/**
 * Convida (ou desconvida) um cliente a migrar a cobrança manual pro Asaas.
 *
 * Por que precisa de convite: /assinatura manda quem está "paid" pra tela de
 * gestão. O cliente marcado como pago à mão fica preso ali — não existe
 * caminho até o cartão recorrente, e é justamente quem mais interessa migrar,
 * porque hoje a cobrança dele depende de alguém lembrar do Pix todo mês.
 *
 * Não criamos a cobrança no Asaas por aqui de propósito: o Asaas exige
 * CPF/CNPJ e nenhum cliente tem esse campo preenchido. Quem informa é o
 * próprio cliente no checkout — documento fiscal digitado por terceiro vira
 * nota fiscal errada depois.
 */
export async function convidarParaAsaas(
  _prev: ConviteAsaasState,
  formData: FormData,
): Promise<ConviteAsaasState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, error: "Cliente não identificado." }
    const remover = String(formData.get("remover") ?? "") === "1"

    /* Cupom junto do convite: assim o desconto JÁ CHEGA aplicado quando o
     * cliente abre /assinatura, sem depender de ele digitar o código certo.
     * Quem digita erra, esquece, ou pergunta — e aí a negociação que você
     * fechou por WhatsApp não acontece na tela.
     *
     * O campo continua existindo na tela do cliente pra quem recebeu o código
     * por fora (indicação de terceiro, sem convite seu). */
    const cupom = String(formData.get("cupom") ?? "").trim()
    let indicador: { id: string; descontoPct: number } | null = null
    if (cupom && !remover) {
      indicador = await acharIndicadorPorCodigo(cupom)
      if (!indicador)
        return { ok: false, error: `Cupom "${cupom}" não existe ou está inativo.` }
    }

    const { error } = await admin
      .from("holdings")
      .update({
        convite_asaas_em: remover ? null : new Date().toISOString(),
        // Retirar o convite limpa o desconto junto: convite retirado é
        // negociação desfeita, e desconto órfão viraria surpresa depois.
        ...(remover
          ? { desconto_primeira_fatura_pct: null }
          : indicador
            ? {
                desconto_primeira_fatura_pct: indicador.descontoPct,
                indicado_por: indicador.id,
                indicado_em: new Date().toISOString(),
              }
            : {}),
      })
      .eq("id", holdingId)
    if (error) return { ok: false, error: error.message }

    await auditar("convite_asaas.alterado", holdingId, { remover, cupom: cupom || null })
    revalidatePath("/clientes")
    if (remover)
      return { ok: true, removido: true, message: "Convite retirado." }

    // Domínio do produto, não o da Cozina Foods: quem recebe este link é
    // cliente de SaaS e vai desconfiar de um endereço que não é a marca que
    // ele contratou.
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
    return {
      ok: true,
      link: `${base}/assinatura`,
      message: "Convite liberado — mande o link pro cliente.",
    }
  })
}

export async function recordPayment(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }
    const paidOn = dateOrNull(formData.get("paidOn"))
    if (!paidOn) return { ok: false, message: "Informe a data do pagamento." }
    const amtRaw = String(formData.get("amount") ?? "").replace(/\./g, "").replace(",", ".").trim()
    const amount = amtRaw ? Number(amtRaw) : NaN
    if (Number.isNaN(amount) || amount <= 0) return { ok: false, message: "Informe um valor válido." }

    const method = String(formData.get("method") ?? "").trim() || null
    const { data: pagamento, error } = await admin
      .from("holding_payments")
      .insert({
        holding_id: holdingId,
        paid_on: paidOn,
        amount,
        method,
        ref_month: String(formData.get("refMonth") ?? "").trim() || null,
        note: String(formData.get("note") ?? "").trim() || null,
      })
      .select("id")
      .single()
    if (error) return { ok: false, message: error.message }

    // Amarra o recebimento à dívida: quita a fatura aberta mais antiga. Sem
    // isso o dinheiro entrava no caixa e a fatura seguia aberta, inflando a
    // inadimplência com valor que já foi pago.
    if (pagamento?.id) {
      const q = await quitarFaturaComPagamento(holdingId, pagamento.id, paidOn, amount)
      await auditar("pagamento.registrado", holdingId, {
        valor: amount,
        pagoEm: paidOn,
        metodo: method,
        faturaQuitada: q.competencia ?? null,
      })
    }

    // Registrar pagamento TAMBÉM marca o cliente como pago (tira do teste, limpa
    // suspensão, define o próximo vencimento) — a não ser que desmarcado. Antes
    // isso só entrava no histórico e o cliente ficava "em teste" (confuso).
    if (formData.get("markPaid") === "on") {
      const patch: Record<string, unknown> = {
        paid: true,
        trial_ends_at: null,
        suspend_on: null,
        due_date: addMonth(paidOn),
      }
      if (method) patch.payment_method = method
      const { error: upErr } = await admin
        .from("holdings")
        .update(patch)
        .eq("id", holdingId)
      if (upErr) return { ok: false, message: upErr.message }
    }

    revalidatePath("/clientes")
    return { ok: true }
  })
}

/** Soma 1 mês a uma data "YYYY-MM-DD" (próximo vencimento). */
function addMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + 1)
  return dt.toISOString().slice(0, 10)
}

/** Remove um pagamento registrado (super-admin). */
export async function deletePayment(paymentId: string): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    if (!paymentId) return { ok: false, message: "Pagamento não identificado." }
    const { error } = await admin.from("holding_payments").delete().eq("id", paymentId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/clientes")
    return { ok: true }
  })
}

/**
 * Exclui um CLIENTE (holding) inteiro: usuários (auth, cascata profiles +
 * acessos), lojas (cascata dos dados), marcas e a empresa. Só super-admin.
 * Guarda: não deixa excluir a PRÓPRIA empresa do super-admin (evita apagar a
 * Cozina sem querer). Ordem FK-safe: units → brands → users → holding.
 */
export async function deleteClient(
  holdingId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!holdingId) return { ok: false, message: "Cliente inválido." }
  try {
    const { admin } = await requireSuperadmin()
    const myHolding = await getCurrentHoldingId()
    if (holdingId === myHolding)
      return {
        ok: false,
        message: "Não dá pra excluir a sua própria empresa por aqui.",
      }

    const { data: brandsData } = await admin
      .from("brands")
      .select("id")
      .eq("holding_id", holdingId)
    const brandIds = (brandsData ?? []).map((b) => b.id)

    let unitIds: string[] = []
    if (brandIds.length > 0) {
      const { data: unitsData } = await admin
        .from("units")
        .select("id")
        .in("brand_id", brandIds)
      unitIds = (unitsData ?? []).map((u) => u.id)
    }

    // usuários vinculados à empresa (qualquer escopo que aponte pra ela)
    const scopeIds = [holdingId, ...brandIds, ...unitIds]
    const { data: accessData } = await admin
      .from("user_unit_access")
      .select("user_id")
      .in("scope_id", scopeIds)
    const userIds = [...new Set((accessData ?? []).map((a) => a.user_id))]

    // lojas (cascata dos dados) → marcas → usuários (cascata acessos) → empresa
    if (unitIds.length > 0) {
      const { error } = await admin.from("units").delete().in("id", unitIds)
      if (error)
        return { ok: false, message: `Erro ao excluir as lojas: ${error.message}` }
    }
    if (brandIds.length > 0)
      await admin.from("brands").delete().in("id", brandIds)
    for (const uid of userIds) await admin.auth.admin.deleteUser(uid)
    const { error: hErr } = await admin
      .from("holdings")
      .delete()
      .eq("id", holdingId)
    if (hErr) return { ok: false, message: hErr.message }

    revalidatePath("/clientes")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao excluir cliente.",
    }
  }
}

export type NfSetupState = {
  ok: boolean
  message?: string
}

/**
 * Liga a emissão automática de NF nas assinaturas que JÁ existem.
 *
 * Assinatura nova já nasce configurada (ver /assinatura/_actions.ts); esta
 * ação é pras que foram criadas antes disso, ou pra reaplicar quando os dados
 * fiscais mudam (troca de código de serviço, de alíquota…). É idempotente:
 * rodar de novo só sobrescreve com a mesma config.
 */
export async function configurarNfAutomatica(): Promise<NfSetupState> {
  try {
    const { admin } = await requireSuperadmin()

    if (asaasIsMock()) {
      return { ok: false, message: "ASAAS_API_KEY não configurada." }
    }

    const { data: holdings } = await admin
      .from("holdings")
      .select("id, name, asaas_subscription_id")
      .not("asaas_subscription_id", "is", null)

    if (!holdings?.length) {
      return { ok: false, message: "Nenhuma assinatura pra configurar." }
    }

    const settings = fiscalInvoiceSettings()
    let ok = 0
    const falhou: string[] = []

    for (const h of holdings) {
      try {
        await asaasSetSubscriptionInvoiceSettings(
          h.asaas_subscription_id as string,
          settings,
        )
        ok++
      } catch (e) {
        falhou.push(
          `${h.name as string}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }

    if (falhou.length) {
      return {
        ok: false,
        message: `${ok} configurada(s), ${falhou.length} com erro — ${falhou.join(" · ")}`,
      }
    }
    return {
      ok: true,
      message: `${ok} assinatura(s) emitindo nota automático a cada pagamento confirmado.`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao configurar a NF.",
    }
  }
}

/** Busca o detalhe de um cliente sob demanda (pro drawer da lista). */
export async function fetchClientDetail(id: string) {
  const { getClientDetail } = await import("@/lib/data/plataforma")
  return getClientDetail(id)
}

/**
 * Exclusão em massa (super-admin). Reusa deleteClient por id — pula a própria
 * empresa. Retorna quantos foram e a lista de erros.
 */
export async function deleteClients(
  ids: string[],
): Promise<{ ok: boolean; deleted: number; failed: number; message?: string }> {
  let deleted = 0
  let failed = 0
  const erros: string[] = []
  for (const id of ids) {
    const res = await deleteClient(id)
    if (res.ok) deleted += 1
    else {
      failed += 1
      if (res.message) erros.push(res.message)
    }
  }
  revalidatePath("/clientes")
  revalidatePath("/", "layout")
  return {
    ok: failed === 0,
    deleted,
    failed,
    message: erros.length ? erros.slice(0, 3).join(" · ") : undefined,
  }
}

/**
 * Define/troca o plano de UM cliente (super-admin). Antes o plan_tier só era
 * escrito pelo self-service do próprio cliente ou pelo webhook do Asaas — o
 * dono não tinha como carimbar o plano de quem provisionou/cobra manual (por
 * isso ficava NULL e "não sabia o plano de cada um"). Valor vazio = limpa.
 */
export async function setClientPlanTier(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }
    const tier = String(formData.get("tier") ?? "").trim()
    if (tier && !["essencial", "pro", "ai"].includes(tier))
      return { ok: false, message: "Plano inválido." }
    const { data: antes } = await admin
      .from("holdings")
      .select("plan_tier")
      .eq("id", holdingId)
      .maybeSingle()
    const { error } = await admin
      .from("holdings")
      .update({ plan_tier: tier || null })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }

    await auditar("plano.alterado", holdingId, {
      de: (antes as { plan_tier?: string | null } | null)?.plan_tier ?? null,
      para: tier || null,
    })
    // Trocar de plano muda o preço, então a assinatura recorrente precisa
    // acompanhar — senão o cliente sobe pro AI e segue pagando o Pro.
    await sincronizarValorAssinatura(holdingId)

    revalidatePath("/clientes")
    revalidatePath("/", "layout")
    return { ok: true }
  })
}

/** Dias de degustação do Nino (cortesia). */
const NINO_DEGUSTACAO_DIAS = 7

/**
 * Liga/desliga a degustação do Nino AI de um cliente (super-admin). Liga =
 * nino_trial_ends_at daqui a NINO_DEGUSTACAO_DIAS; desliga = limpa. Libera só o
 * Nino (com cota enxuta), sem virar plano AI nem mexer no Financeiro.
 */
export async function toggleNinoDegustacao(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  return guard(async () => {
    const { admin } = await requireSuperadmin()
    const holdingId = String(formData.get("holdingId") ?? "").trim()
    if (!holdingId) return { ok: false, message: "Cliente não identificado." }
    const ligar = String(formData.get("acao") ?? "") === "liberar"
    let ends: string | null = null
    if (ligar) {
      const d = new Date()
      d.setDate(d.getDate() + NINO_DEGUSTACAO_DIAS)
      ends = d.toISOString()
    }
    const { error } = await admin
      .from("holdings")
      .update({ nino_trial_ends_at: ends })
      .eq("id", holdingId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/clientes")
    revalidatePath("/", "layout")
    return { ok: true }
  })
}

// ─── Aviso por push ──────────────────────────────────────────────────────────

export type AvisoPushState = {
  ok: boolean
  message?: string
  /** Quantos aparelhos receberam de fato. */
  enviados?: number
}

/**
 * Quantos APARELHOS receberiam o aviso — chamado ANTES de enviar.
 *
 * Este número é o ponto da tela. Em 03/ago/26 o Marcus pediu um push de
 * boas-vindas pra um cliente que usava o app todo dia; o sistema INTEIRO tinha
 * uma assinatura (a do teste interno), e o envio teria retornado "0 enviados"
 * sem ninguém perceber. Push não tem como despublicar, mas também não avisa
 * quando não chega em ninguém — ver o número antes é a única defesa.
 */
export async function contarAparelhosPush(
  holdingId: string | null,
): Promise<{ aparelhos: number; pessoas: number }> {
  const { admin } = await requireSuperadmin()

  let userIds: string[] | null = null
  if (holdingId) {
    const { data } = await admin
      .from("user_unit_access")
      .select("user_id")
      .eq("scope_type", "holding")
      .eq("scope_id", holdingId)
    userIds = [...new Set((data ?? []).map((r) => r.user_id as string))]
    if (userIds.length === 0) return { aparelhos: 0, pessoas: 0 }
  }

  let q = admin
    .from("push_subscriptions")
    .select("user_id")
    .is("invalid_since", null)
  if (userIds) q = q.in("user_id", userIds)
  const { data } = await q
  const linhas = (data ?? []) as { user_id: string }[]
  return {
    aparelhos: linhas.length,
    pessoas: new Set(linhas.map((l) => l.user_id)).size,
  }
}

/** Dispara o aviso. `holdingId` vazio = todos os clientes. */
export async function enviarAvisoPush(
  _prev: AvisoPushState,
  formData: FormData,
): Promise<AvisoPushState> {
  const { admin } = await requireSuperadmin()

  const holdingId = String(formData.get("holdingId") ?? "").trim() || null
  const titulo = String(formData.get("titulo") ?? "").trim()
  const corpo = String(formData.get("corpo") ?? "").trim()
  const url = String(formData.get("url") ?? "").trim() || "/inicio"

  if (titulo.length < 3) return { ok: false, message: "Escreva um título." }
  if (corpo.length < 5) return { ok: false, message: "Escreva a mensagem." }

  let userIds: string[] = []
  if (holdingId) {
    const { data } = await admin
      .from("user_unit_access")
      .select("user_id")
      .eq("scope_type", "holding")
      .eq("scope_id", holdingId)
    userIds = [...new Set((data ?? []).map((r) => r.user_id as string))]
  } else {
    const { data } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .is("invalid_since", null)
    userIds = [...new Set((data ?? []).map((r) => r.user_id as string))]
  }

  if (userIds.length === 0)
    return { ok: false, message: "Ninguém pra receber neste escopo." }

  const { enviarPush } = await import("@/lib/push/enviar")
  const r = await enviarPush(userIds, { titulo, corpo, url, tag: "aviso-admin" })

  if (r.semChave)
    return { ok: false, message: "VAPID ausente no servidor — nada enviado." }

  // Fica no histórico do cliente: push não dá pra despublicar, então saber
  // exatamente o que foi dito e quando é o que sobra.
  await auditar("push.aviso", holdingId, {
    titulo,
    corpo,
    url,
    aparelhos: r.enviados,
    escopo: holdingId ? "cliente" : "todos os clientes",
  })

  revalidatePath("/clientes")
  return {
    ok: true,
    enviados: r.enviados,
    message:
      r.enviados === 0
        ? "Ninguém tinha aparelho ativo — nada foi entregue."
        : `Entregue em ${r.enviados} aparelho(s).`,
  }
}

/**
 * Entra na visão somente-leitura de um cliente ("ver como").
 *
 * Só superadmin: `requireSuperadmin` lança se não for, e o portão em
 * permissions.ts confere de novo a cada leitura — o cookie não é a
 * autorização, é só o alvo escolhido.
 *
 * A auditoria vem ANTES de redirecionar, e de propósito não é `void`: olhar o
 * dado de um cliente é o ato que se quer poder provar depois. Se o log
 * falhasse em silêncio, restaria uma visão sem registro nenhum.
 */
export async function entrarVerComoAction(formData: FormData) {
  const { email } = await requireSuperadmin()
  const holdingId = String(formData.get("holdingId") ?? "").trim()
  if (!holdingId) return

  const admin = createAdminClient()
  const { data: cliente } = await admin
    .from("holdings")
    .select("name")
    .eq("id", holdingId)
    .maybeSingle()

  await auditar("superadmin.ver_como", holdingId, {
    cliente: cliente?.name ?? holdingId,
    por: email,
  })

  const jar = await cookies()
  jar.set(COOKIE_VER_COMO, holdingId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VER_COMO_DURACAO_S,
  })

  redirect("/inicio")
}
