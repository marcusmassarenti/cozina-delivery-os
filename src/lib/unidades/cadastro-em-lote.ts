import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type LojaEmLote = {
  unitId: string
  code: string
  name: string
  cnpj: string
}

/**
 * CADASTRO EM LOTE: pedir conexão de várias lojas de uma vez, sem perder o aviso.
 *
 * ── POR QUE EXISTE (19/08/26) ────────────────────────────────────────────
 * Cadastrei 15 lojas do Churrasco Royal direto no banco, a pedido do Marcus, e
 * criei as 30 solicitações (iFood + 99) com um INSERT. Só que o e-mail de
 * "cliente pediu conexão" NÃO nasce do banco: ele é disparado pela server
 * action, na linha seguinte ao insert. Resultado: a fila encheu e ninguém foi
 * avisado — ele só descobriu porque estranhou não ter recebido nada.
 *
 * A lição é velha neste projeto e apareceu de novo: quando a regra mora na
 * action e alguém escreve direto na tabela, o efeito colateral some em
 * silêncio. Este módulo é o caminho único pra cadastro em lote — grava E avisa.
 *
 * ⚠️ UM E-MAIL, NÃO N. Quinze lojas × duas plataformas seriam 30 avisos na
 * mesma caixa, e trinta avisos idênticos não são trinta lembretes: são um
 * ruído que faz parar de ler. O resumo lista tudo e serve de lista de trabalho.
 */
export async function pedirConexaoEmLote(opts: {
  holdingId: string
  cliente: string
  lojas: LojaEmLote[]
  plataformas: ("ifood" | "99food")[]
  nota?: string
  /** Não manda e-mail — para quando quem chamou já vai avisar de outro jeito. */
  semAviso?: boolean
}): Promise<{ criadas: number; avisado: string }> {
  const admin = createAdminClient()
  const nota = opts.nota ?? "Cadastro em lote"
  let criadas = 0

  for (const plat of opts.plataformas) {
    const tabela =
      plat === "ifood"
        ? "ifood_activation_requests"
        : "ninefood_activation_requests"

    for (const l of opts.lojas) {
      // Não duplica pedido em aberto — a mesma guarda da tela.
      const { data: aberta } = await admin
        .from(tabela)
        .select("id")
        .eq("unit_id", l.unitId)
        .in("status", ["pendente", "solicitada", "ativa"])
        .limit(1)
      if ((aberta ?? []).length > 0) continue

      const { error } = await admin.from(tabela).insert({
        holding_id: opts.holdingId,
        unit_id: l.unitId,
        cnpj: l.cnpj,
        nota,
      })
      // Erro conferido: insert de fila que falha calado deixa o cliente
      // esperando por uma coisa que nunca entrou.
      if (error) {
        console.error(`[lote] ${plat} ${l.code}:`, error.message)
        continue
      }
      criadas += 1
    }
  }

  if (opts.semAviso || criadas === 0) {
    return { criadas, avisado: "sem aviso" }
  }

  try {
    const { enviarEmail } = await import("@/lib/email/enviar")
    const { montarAvisoConexao, linhaAviso, cnpjBonito } = await import(
      "@/lib/email/aviso-conexao"
    )
    const rotulos = opts.plataformas
      .map((p) => (p === "ifood" ? "iFood" : "99 Food"))
      .join(" e ")

    const linhas = opts.lojas
      .map((l) => linhaAviso(`${l.code} · ${l.name}`, cnpjBonito(l.cnpj)))
      .join("")

    const r = await enviarEmail({
      holdingId: null, // interno, não é régua de cliente
      tipo: "conexao-lote",
      para: process.env.SAUDE_EMAIL ?? "marcus@massarenti.me",
      assunto: `${opts.lojas.length} lojas pedindo conexão · ${opts.cliente}`,
      html: montarAvisoConexao({
        plataforma: rotulos,
        titulo: `${opts.cliente}: ${opts.lojas.length} lojas entraram na fila`,
        linhas,
        proximoPasso: `Pedido de <strong>${rotulos}</strong> para as ${opts.lojas.length} lojas acima. No iFood, o caminho é lançar cada CNPJ no Portal do Desenvolvedor; no 99, confirmar a loja e vincular.`,
        acaoHref: "/integracao/ifood-merchants",
        acaoTexto: "Abrir a fila de conexões",
      }),
      forcar: true,
    })
    return {
      criadas,
      avisado: r.ok ? "e-mail enviado" : `falhou: ${r.erro ?? "erro no envio"}`,
    }
  } catch (e) {
    console.error("[lote] aviso:", e)
    return { criadas, avisado: "falhou (erro interno)" }
  }
}
