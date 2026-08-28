import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import type { LojaOnboarding, StatusOnboarding } from "./carteira-onboarding-tipos"

/**
 * A fila entre "vendeu" e "está sendo cuidada" — T5 do painel da agência.
 *
 * São TRÊS papéis distintos e a tela existe porque não são a mesma pessoa: o
 * comercial fecha e sai, o sucesso alinha e agenda, o gestor recebe e cuida.
 * Loja que trava aqui ficou vendida e sem ninguém — o pior estado possível,
 * porque o cliente já está pagando.
 */
export async function filaDeOnboarding(): Promise<LojaOnboarding[]> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return []

  const { data } = await createAdminClient()
    .from("units")
    .select(
      "id, code, name, data_venda, promessa_comercial, sucesso_responsavel, onboarding_status, onboarding_reuniao_em, onboarding_link, onboarding_observacoes, checklist_ok_em, cardapio_ok_em, encaminhada_em, categoria_carteira, brands!inner(holding_id), gestores(nome), vendedores(nome)",
    )
    .eq("brands.holding_id", holdingId)
    .order("code")

  const linhas = (data ?? []) as unknown as {
    id: string
    code: string
    name: string
    data_venda: string | null
    promessa_comercial: string | null
    sucesso_responsavel: string | null
    onboarding_status: StatusOnboarding | null
    onboarding_reuniao_em: string | null
    onboarding_link: string | null
    onboarding_observacoes: string | null
    checklist_ok_em: string | null
    cardapio_ok_em: string | null
    encaminhada_em: string | null
    categoria_carteira: string | null
    gestores: { nome: string } | null
    vendedores: { nome: string } | null
  }[]

  const hoje = Date.now()
  return linhas
    /* Loja já em gestão sai da fila — a menos que alguém tenha começado um
       onboarding nela e não terminado. Onboarding é passagem, não cadastro:
       lista que nunca esvazia deixa de ser fila e vira relatório. */
    .filter(
      (l) =>
        l.categoria_carteira === "nova" ||
        (l.onboarding_status !== null && l.onboarding_status !== "concluido"),
    )
    .map((l) => ({
      id: l.id,
      code: l.code,
      nome: l.name,
      vendedorNome: l.vendedores?.nome ?? null,
      dataVenda: l.data_venda,
      promessa: l.promessa_comercial,
      sucessoResponsavel: l.sucesso_responsavel,
      status: l.onboarding_status,
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
