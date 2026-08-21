"use server"

/**
 * O que acontece quando o cliente diz "já fiz a minha parte".
 *
 * Cada plataforma tem um combinado diferente, e o botão respeita isso em vez
 * de fingir que são iguais (Marcus, 18/08/26):
 *
 *  • Cardápio Web — ele autoriza sozinho no nosso link. Ao concluir, o sistema
 *    CONFERE se a instalação chegou; se não chegou, diz isso em vez de aceitar
 *    um "concluí" que não aconteceu.
 *  • 99 Food — ele autoriza no portal do 99. Ao concluir, varremos a lista na
 *    hora: loja que apareceu desde o início do passo é dele.
 *  • iFood — ele pede, NÓS cadastramos o CNPJ no portal, ele autoriza nas
 *    integrações e avisa. Três mãos, duas nossas.
 *  • Keeta — não tem API. Concluir aqui é registrar que ele entendeu que o
 *    caminho é planilha.
 */
import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { conexaoEsperando } from "@/lib/email/templates"
import { enviarEmail } from "@/lib/email/enviar"
import { listarLojas99 } from "@/lib/ninefood/lojas"
import type { PlatformId } from "@/components/platform-logo"

export type EstadoPasso = {
  ok: boolean
  mensagem?: string
  erro?: string
  conectouAgora?: boolean
}

const ROTULO: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

async function unidadeDoUsuario(unitId: string) {
  const units = await getVisibleUnits()
  return units.find((u) => u.id === unitId) ?? null
}

/**
 * Põe a loja na fila do 99 quando não deu pra vincular sozinho.
 *
 * A esteira só sabia fazer duas coisas: vincular na hora (quando existe
 * exatamente uma loja nova no portal) ou dizer "vamos confirmar". No segundo
 * caso não sobrava registro nenhum — a Donna Tatta e a Açaí RG Estilo
 * concluíram em 19/08/26 e ficaram invisíveis, do mesmo jeito que as do iFood.
 * "Vamos confirmar" precisa ter onde confirmar.
 */
async function registrarPedido99(
  admin: ReturnType<typeof createAdminClient>,
  unitId: string,
  cnpjBruto: string | null | undefined,
) {
  const cnpj = (cnpjBruto ?? "").replace(/\D/g, "")
  if (cnpj.length !== 14) return
  const holdingId = await holdingDaUnidade(admin, unitId)
  if (!holdingId) return
  const { data: jaTem } = await admin
    .from("ninefood_activation_requests")
    .select("id")
    .eq("unit_id", unitId)
    .in("status", ["pendente", "solicitada", "ativa"])
    .limit(1)
  if ((jaTem ?? []).length > 0) return
  const { error } = await admin
    .from("ninefood_activation_requests")
    .insert({ holding_id: holdingId, unit_id: unitId, cnpj })
  // Não derruba o passo do cliente, mas DEIXA RASTRO: foi a falta disso que
  // fez o pedido do iFood sumir sem ninguém notar.
  if (error) console.error("[conectar-loja] pedido 99:", error.message)
}

/** A conta dona da loja. `ifood_activation_requests.holding_id` é NOT NULL. */
async function holdingDaUnidade(
  admin: ReturnType<typeof createAdminClient>,
  unitId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("units")
    .select("brands(holding_id)")
    .eq("id", unitId)
    .maybeSingle()
  const b = (data as { brands?: { holding_id?: string } | null } | null)?.brands
  return b?.holding_id ?? null
}

export async function concluirPasso(
  unitId: string,
  platform: PlatformId,
): Promise<EstadoPasso> {
  const loja = await unidadeDoUsuario(unitId)
  if (!loja) return { ok: false, erro: "Loja fora do seu acesso." }

  const admin = createAdminClient()
  const agora = new Date().toISOString()
  let conectouAgora = false
  let mensagem = "Anotado! Vamos cuidar do resto."

  if (platform === "cardapioweb") {
    const { data: inst } = await admin
      .from("cardapioweb_installs")
      .select("id")
      .eq("unit_id", unitId)
      .limit(1)
    if ((inst ?? []).length === 0) {
      return {
        ok: false,
        erro:
          "Ainda não recebemos a autorização do Cardápio Web. Abra o link, conclua a autorização por lá e clique aqui de novo.",
      }
    }
    conectouAgora = true
    mensagem = "Conectado! Já estamos trazendo o histórico."
  }

  if (platform === "99food") {
    const { data: passo } = await admin
      .from("onboarding_conexao")
      .select("contexto")
      .eq("unit_id", unitId)
      .eq("platform", "99food")
      .maybeSingle()
    const antes = new Set<string>(
      ((passo?.contexto as { antes?: string[] } | null)?.antes ?? []) as string[],
    )
    try {
      const lojas = await listarLojas99()
      const { data: jaLigadas } = await admin
        .from("ninefood_store_links")
        .select("app_shop_id")
      const usadas = new Set(
        ((jaLigadas ?? []) as { app_shop_id: string }[]).map((r) => r.app_shop_id),
      )
      // ⚠️ Só vincula quando a resposta é ÚNICA. Duas candidatas viram escolha
      // humana: ligar a loja errada mistura o faturamento de dois lojistas, e
      // isso é bem pior que esperar um clique nosso.
      const novas = lojas
        .map((l) => l.appShopId)
        .filter((id) => !antes.has(id) && !usadas.has(id))
      if (novas.length === 1) {
        await admin.from("ninefood_store_links").upsert(
          {
            app_shop_id: novas[0],
            unit_id: unitId,
            name: loja.name,
            active: true,
            id_loja: lojas.find((l) => l.appShopId === novas[0])?.shopId ?? null,
          },
          { onConflict: "app_shop_id" },
        )
        conectouAgora = true
        mensagem = "Conectado! Já estamos trazendo o histórico."
      } else {
        await registrarPedido99(admin, unitId, loja.cnpj)
        mensagem =
          "Recebemos! Vamos confirmar a sua loja no 99 e avisar quando estiver ligada."
      }
    } catch {
      await registrarPedido99(admin, unitId, loja.cnpj)
      mensagem =
        "Recebemos! Vamos confirmar a sua loja no 99 e avisar quando estiver ligada."
    }
  }

  if (platform === "ifood") {
    const cnpj = (loja.cnpj ?? "").replace(/\D/g, "")
    if (cnpj.length !== 14) {
      return {
        ok: false,
        erro:
          "Falta o CNPJ desta loja no cadastro — é ele que o iFood usa pra liberar o acesso.",
      }
    }
    /**
     * ⚠️ ESTE INSERT É O QUE FAZ A LOJA EXISTIR PRA NÓS.
     *
     * `ifood_activation_requests` é a fila de trabalho do iFood: é dela que
     * saem o contador de `/clientes/conexoes` e a lista de
     * `/integracao/ifood-merchants`. Sem a linha aqui, a loja fica invisível
     * pro time — o cliente lê "vamos cadastrar sua loja" e ninguém tem o que
     * cadastrar.
     *
     * Foi o que aconteceu em 19/08/26: `holding_id` é NOT NULL e o insert não
     * mandava. Ele estourava, o erro não era conferido, e a função seguia reto
     * gravando o passo e disparando o e-mail. Seis lojas da DG FOODS
     * concluíram a esteira e a fila ficou VAZIA — sem nenhum sinal de erro em
     * lugar nenhum.
     *
     * Por isso o erro agora VOLTA pro cliente. Dizer "recebemos" sem ter
     * recebido é pior que dizer "deu ruim, tenta de novo".
     */
    const holdingId = await holdingDaUnidade(admin, unitId)
    if (!holdingId) {
      return {
        ok: false,
        erro: "Não consegui identificar a conta desta loja. Fale com a gente.",
      }
    }

    const { data: jaTem } = await admin
      .from("ifood_activation_requests")
      .select("id")
      .eq("unit_id", unitId)
      .in("status", ["pendente", "solicitada", "ativa"])
      .limit(1)
    if ((jaTem ?? []).length === 0) {
      const { error } = await admin
        .from("ifood_activation_requests")
        .insert({ holding_id: holdingId, unit_id: unitId, cnpj })
      if (error) {
        console.error("[conectar-loja] solicitação iFood:", error.message)
        return {
          ok: false,
          erro:
            "Não consegui registrar o pedido agora. Tente de novo em instantes — se persistir, fale com a gente.",
        }
      }
    }
    mensagem =
      "Recebemos! Vamos cadastrar sua loja no iFood e avisar quando for a sua vez de autorizar."
  }

  if (platform === "keeta") {
    mensagem = "Combinado! É só subir a planilha da Keeta na tela de Importação."
  }

  await admin.from("onboarding_conexao").upsert(
    {
      unit_id: unitId,
      platform,
      etapa: conectouAgora ? "conectada" : "cliente_concluiu",
      cliente_concluiu_em: agora,
      ...(conectouAgora ? { conectada_em: agora } : {}),
      atualizado_em: agora,
    },
    { onConflict: "unit_id,platform" },
  )

  await avisarTime(unitId, loja.name, loja.code)

  revalidatePath(`/conectar-loja/${loja.code}`)
  revalidatePath("/inicio")
  return { ok: true, mensagem, conectouAgora }
}

/**
 * Um e-mail só, com o quadro inteiro.
 *
 * ⚠️ NÃO é um e-mail por clique. O cliente percorre três passos em poucos
 * minutos, e três e-mails viram três tarefas na cabeça de quem lê — quando é
 * uma só: "esta loja está esperando por você". Cada novo passo reenvia o
 * quadro ATUALIZADO, não um fragmento.
 */
async function avisarTime(unitId: string, lojaNome: string, lojaCode: string) {
  const admin = createAdminClient()
  const { data: passos } = await admin
    .from("onboarding_conexao")
    .select("platform, etapa")
    .eq("unit_id", unitId)

  const pendentes = ((passos ?? []) as { platform: string; etapa: string }[])
    .filter((p) => p.etapa === "cliente_concluiu")
  const prontas = ((passos ?? []) as { platform: string; etapa: string }[])
    .filter((p) => p.etapa === "conectada")

  // Sem nada esperando por nós, não há o que avisar — o cliente resolveu
  // sozinho e um e-mail seria só ruído.
  if (pendentes.length === 0) return

  const acao: Record<string, string> = {
    ifood: "cadastre o CNPJ no portal do iFood e avise o cliente pra autorizar",
    "99food": "confirme qual loja é no 99 e vincule",
    keeta: "nada a fazer — é planilha",
    cardapioweb: "confira a instalação",
  }

  const { assunto, html } = conexaoEsperando({
    lojaCode,
    lojaNome,
    pendentes: pendentes.map((p) => ({
      plataforma: ROTULO[p.platform] ?? p.platform,
      acao: acao[p.platform] ?? "conferir",
    })),
    prontas: prontas.map((p) => ROTULO[p.platform] ?? p.platform),
  })

  await enviarEmail({
    holdingId: null,
    tipo: "onboarding-conexao",
    para: process.env.SAUDE_EMAIL ?? "marcus@massarenti.me",
    assunto,
    html,
    forcar: true,
  })

  await admin
    .from("onboarding_conexao")
    .update({ avisado_em: new Date().toISOString() })
    .eq("unit_id", unitId)
    .eq("etapa", "cliente_concluiu")
}

/**
 * Fotografa quais lojas do 99 já existiam ANTES de o cliente ir autorizar.
 *
 * É esse recorte que permite dizer, na volta, qual apareceu por causa dele: a
 * API do 99 não devolve nome de loja, então o TEMPO é o único identificador
 * disponível. Chamado quando ele abre o link — não quando volta.
 */
export async function marcarInicio99(unitId: string): Promise<void> {
  const loja = await unidadeDoUsuario(unitId)
  if (!loja) return
  try {
    const lojas = await listarLojas99()
    const admin = createAdminClient()
    await admin.from("onboarding_conexao").upsert(
      {
        unit_id: unitId,
        platform: "99food",
        contexto: { antes: lojas.map((l) => l.appShopId) },
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unit_id,platform" },
    )
  } catch {
    // Sem a foto do "antes", concluir cai no caminho manual — degrada, não
    // quebra.
  }
}
