/**
 * Boas-vindas no primeiro acesso — não no cron do dia seguinte.
 *
 * A régua diária cobriria isso, mas com até 24h de atraso: a pessoa confirma o
 * cadastro, entra no sistema, mexe uma tarde inteira e só no dia seguinte
 * recebe um "seja bem-vindo". Chega errado. Aqui o e-mail sai no primeiro
 * carregamento de tela autenticada, que é o momento em que ela de fato entrou.
 *
 * Roda depois da resposta (`after`), então não segura o render. A trava de
 * duplicidade continua sendo a mesma da régua (índice único em
 * email_enviados), então cron e primeiro acesso não se atropelam: quem chegar
 * primeiro manda, o outro vê que já foi e não faz nada.
 */
import "server-only"

import { enviarEmail } from "@/lib/email/enviar"
import { boasVindas } from "@/lib/email/templates"
import { createAdminClient } from "@/lib/supabase/admin"

export async function enviarBoasVindasSePreciso(input: {
  userId: string
  email: string | null | undefined
  emailConfirmado: boolean
  nome: string | null
  holdingId: string | null
}): Promise<void> {
  try {
    const { email, holdingId } = input
    // Sem e-mail confirmado não sai nada: é a mesma regra da régua — mandar
    // pra endereço não confirmado gasta reputação de domínio à toa.
    if (!email || !input.emailConfirmado || !holdingId) return

    const admin = createAdminClient()

    // Uma leitura barata antes de qualquer trabalho. Como este código roda em
    // TODA tela autenticada, o caminho comum precisa ser "já enviei, sai fora".
    const { data: ja } = await admin
      .from("email_enviados")
      .select("id")
      .eq("holding_id", holdingId)
      .eq("tipo", "boas-vindas")
      .is("erro", null)
      .maybeSingle()
    if (ja) return

    const { data: h } = await admin
      .from("holdings")
      .select("name, conta_interna")
      .eq("id", holdingId)
      .maybeSingle()
    if (!h || h.conta_interna) return

    // Quantas lojas já existem decide o texto: quem ainda não cadastrou
    // nenhuma recebe o convite pra cadastrar a primeira; quem já cadastrou
    // recebe o tour do que dá pra fazer.
    const { data: brands } = await admin
      .from("brands")
      .select("id")
      .eq("holding_id", holdingId)
    const brandIds = ((brands ?? []) as { id: string }[]).map((b) => b.id)
    let lojas = 0
    if (brandIds.length) {
      const { count } = await admin
        .from("units")
        .select("id", { count: "exact", head: true })
        .in("brand_id", brandIds)
        .eq("active", true)
      lojas = count ?? 0
    }

    await enviarEmail({
      holdingId,
      tipo: "boas-vindas",
      para: email,
      ...boasVindas({
        nome: input.nome,
        empresa: String(h.name),
        temLoja: lojas > 0,
      }),
    })
  } catch (e) {
    // E-mail de boas-vindas nunca pode derrubar a tela que a pessoa acabou de
    // abrir. Falhou, o cron diário pega depois.
    console.error("boas-vindas:", e)
  }
}
