import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  ETAPAS_PADRAO,
  type Etapa,
  type LojaOnboarding,
} from "./carteira-onboarding-tipos"

/**
 * A fila entre "vendeu" e "está sendo cuidada" — T5 do painel da agência.
 *
 * São TRÊS papéis distintos e a tela existe porque não são a mesma pessoa: o
 * comercial fecha e sai, o sucesso alinha e agenda, o gestor recebe e cuida.
 * Loja que trava aqui ficou vendida e sem ninguém — o pior estado possível,
 * porque o cliente já está pagando.
 */

/**
 * As colunas da agência, criando as padrão na primeira visita.
 *
 * Semear na migration cobriria só quem já existe; cliente novo abriria um
 * quadro sem coluna nenhuma e sem entender que precisa criar. Aqui é
 * idempotente: `ON CONFLICT DO NOTHING` pelo par (holding, nome).
 */
export async function etapasDaAgencia(holdingId?: string): Promise<Etapa[]> {
  const hid = holdingId ?? (await getCurrentHoldingId())
  if (!hid) return []
  const admin = createAdminClient()

  const ler = async () =>
    (
      await admin
        .from("carteira_etapas")
        .select("id, nome, ordem, conclui")
        .eq("holding_id", hid)
        .order("ordem")
    ).data as Etapa[] | null

  const atuais = await ler()
  if (atuais && atuais.length > 0) return atuais

  await admin
    .from("carteira_etapas")
    .upsert(
      ETAPAS_PADRAO.map((e) => ({ ...e, holding_id: hid })),
      { onConflict: "holding_id,nome", ignoreDuplicates: true },
    )
  return (await ler()) ?? []
}

export async function filaDeOnboarding(): Promise<LojaOnboarding[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []

  const { data } = await createAdminClient()
    .from("units")
    .select(
      "id, code, name, logo_url, cnpj, city, data_venda, mensalidade, promessa_comercial, sucesso_responsavel, etapa_id, onboarding_reuniao_em, onboarding_link, onboarding_observacoes, checklist_ok_em, cardapio_ok_em, encaminhada_em, categoria_carteira, brands!inner(holding_id), gestores(nome), vendedores(id, nome), carteira_etapas(nome, conclui)",
    )
    .eq("brands.holding_id", holdingId)
    .order("code")

  const linhas = (data ?? []) as unknown as {
    id: string
    code: string
    name: string
    logo_url: string | null
    cnpj: string | null
    city: string | null
    data_venda: string | null
    mensalidade: number | string | null
    promessa_comercial: string | null
    sucesso_responsavel: string | null
    etapa_id: string | null
    onboarding_reuniao_em: string | null
    onboarding_link: string | null
    onboarding_observacoes: string | null
    checklist_ok_em: string | null
    cardapio_ok_em: string | null
    encaminhada_em: string | null
    categoria_carteira: string | null
    gestores: { nome: string } | null
    vendedores: { id: string; nome: string } | null
    carteira_etapas: { nome: string; conclui: boolean } | null
  }[]

  const hoje = Date.now()
  return linhas
    /* Loja já em gestão sai da fila — a menos que esteja numa etapa que não
       seja a de conclusão. Onboarding é passagem, não cadastro: lista que
       nunca esvazia deixa de ser fila e vira relatório. */
    .filter(
      (l) =>
        l.categoria_carteira === "nova" ||
        (l.etapa_id !== null && !l.carteira_etapas?.conclui),
    )
    .map((l) => ({
      id: l.id,
      code: l.code,
      nome: l.name,
      logoUrl: l.logo_url,
      cnpj: l.cnpj,
      cidade: l.city,
      vendedorNome: l.vendedores?.nome ?? null,
      vendedorId: l.vendedores?.id ?? null,
      dataVenda: l.data_venda,
      mensalidade: l.mensalidade === null ? null : Number(l.mensalidade),
      promessa: l.promessa_comercial,
      sucessoResponsavel: l.sucesso_responsavel,
      etapaId: l.etapa_id,
      etapaNome: l.carteira_etapas?.nome ?? null,
      concluida: l.carteira_etapas?.conclui ?? false,
      reuniaoEm: l.onboarding_reuniao_em,
      link: l.onboarding_link,
      observacoes: l.onboarding_observacoes,
      gestorNome: l.gestores?.nome ?? null,
      checklistOk: l.checklist_ok_em !== null,
      cardapioOk: l.cardapio_ok_em !== null,
      encaminhada: l.encaminhada_em !== null,
      diasDesdeVenda: l.data_venda
        ? Math.floor(
            (hoje - new Date(`${l.data_venda}T12:00:00Z`).getTime()) / 86400000,
          )
        : null,
    }))
}

/** Lojas que ainda NÃO estão no quadro — pra o botão "adicionar loja". */
export async function lojasForaDaFila(): Promise<
  { id: string; code: string; nome: string }[]
> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []
  const { data } = await createAdminClient()
    .from("units")
    .select("id, code, name, etapa_id, categoria_carteira, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
    .order("code")
  return ((data ?? []) as unknown as {
    id: string
    code: string
    name: string
    etapa_id: string | null
    categoria_carteira: string | null
  }[])
    .filter((l) => l.categoria_carteira !== "nova" && l.etapa_id === null)
    .map((l) => ({ id: l.id, code: l.code, nome: l.name }))
}

export type { Etapa, LojaOnboarding }
