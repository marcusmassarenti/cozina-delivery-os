import "server-only"

/**
 * Lojas desativadas no cadastro — as que NENHUM sync deve mais puxar.
 *
 * Existe porque todos os syncs filtravam pela plataforma estar ativa
 * (`unit_platforms.active`, `ninefood_store_links.active`) e nenhum olhava se a
 * LOJA ainda existe (`units.active`). São coisas diferentes: a conexão com o
 * iFood continua válida depois que a loja fecha — ninguém desvincula o
 * merchant ao encerrar a operação.
 *
 * O custo disso não era teórico. A Churrasco no Pote – Icaraí fechou em
 * jun/2026, foi marcada como inativa no cadastro, e mesmo assim seguiu sendo
 * sincronizada todo dia: gastava chamada de API e aparecia como "7 dias sem
 * fechar o extrato" no relatório de saúde. Eu cheguei a recomendar acionar o
 * suporte do iFood por causa dela. O Marcus corrigiu: "Icaraí está fechada faz
 * 2 meses; lojas inativas no sistema não devem puxar sync".
 *
 * Fica num módulo só de propósito: a regra vale para os quatro syncs (iFood
 * financeiro, iFood avaliações, 99 financeiro, 99 cardápio) e repetir o filtro
 * em cada um é como ele ia divergir com o tempo.
 */
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * IDs das unidades inativas. Devolve um Set pra o chamador filtrar em memória
 * — os syncs já trazem a lista de lojas por outros critérios, e uma segunda
 * consulta pequena sai mais barato que reescrever cada query com join.
 */
export async function idsDeUnidadesInativas(): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("units")
    .select("id")
    .eq("active", false)
  if (error) {
    // Falhar aqui NÃO pode parar o sync: na dúvida sincroniza demais, que é o
    // comportamento de antes. Deixar de sincronizar por causa de um erro de
    // leitura seria trocar desperdício por buraco no dado.
    console.error("idsDeUnidadesInativas:", error.message)
    return new Set()
  }
  return new Set(((data ?? []) as { id: string }[]).map((u) => u.id))
}

/**
 * TODAS as lojas que o sync deve pular, por qualquer motivo.
 *
 * Ponto único de decisão de propósito. São QUATRO motivos hoje — loja fechada
 * no cadastro, assinatura suspensa há mais de uma semana, a rede de
 * demonstração, e cliente encerrado — e cada um nasceu numa época: se cada
 * sync fizesse a própria união, o terceiro motivo entraria em três dos quatro
 * e ninguém perceberia no quarto. (O terceiro chegou em 13/ago/26 e o quarto
 * em 16/ago/26, os dois entraram aqui, como previsto.)
 *
 * As consultas em paralelo: são pequenas e independentes.
 */
export async function idsDeUnidadesForaDoSync(): Promise<Set<string>> {
  const [
    { idsDeUnidadesSemAssinatura },
    { idsDeUnidadesDemo },
    { idsDeUnidadesEncerradas },
  ] = await Promise.all([
    import("@/lib/data/unidades-sem-assinatura"),
    import("@/lib/data/holding-demo"),
    import("@/lib/data/unidades-encerradas"),
  ])
  const [inativas, semAssinatura, demo, encerradas] = await Promise.all([
    idsDeUnidadesInativas(),
    idsDeUnidadesSemAssinatura(),
    idsDeUnidadesDemo(),
    idsDeUnidadesEncerradas(),
  ])
  for (const id of semAssinatura) inativas.add(id)
  for (const id of demo) inativas.add(id)
  for (const id of encerradas) inativas.add(id)
  return inativas
}

/**
 * Unidades de cliente com ASSINATURA SUSPENSA.
 *
 * ── A REGRA (Marcus, 18/08/26) ───────────────────────────────────────────
 * "cliente suspenso, cessa puxar dados". Quem não está pagando não consome
 * chamada de API nossa — e a conta do iFood/99 é por chamada, então isso é
 * custo direto, não princípio.
 *
 * Suspenso = `suspend_on` preenchido e já vencido. A coluna é a data em que a
 * suspensão passa a valer (vencimento + 7 dias de tolerância), e o webhook do
 * Asaas a limpa no instante em que o pagamento entra.
 *
 * ⚠️ DE PROPÓSITO NÃO É `suspend_on IS NOT NULL`: entre o vencimento e o fim
 * da tolerância o cliente está em atraso, não suspenso — cortar o dado dele aí
 * seria punir quem vai pagar na sexta.
 *
 * Ao pausar, carimba `sync_pausado_em` no cliente. É esse carimbo que permite
 * recuperar a lacuna quando ele voltar: `suspend_on` some no pagamento, e sem
 * um segundo registro a gente não saberia de quando até quando ficou sem dado.
 */
export async function idsDeUnidadesSuspensas(): Promise<Set<string>> {
  const admin = createAdminClient()
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: suspensas } = await admin
    .from("holdings")
    .select("id, sync_pausado_em")
    .not("suspend_on", "is", null)
    .lte("suspend_on", hoje)

  const ids = (suspensas ?? []) as { id: string; sync_pausado_em: string | null }[]
  if (ids.length === 0) return new Set()

  // Carimba a parada em quem ainda não tinha. Só a PRIMEIRA vez: se
  // sobrescrevesse todo dia, a lacuna sempre pareceria de um dia só e a
  // recuperação viria pela metade.
  const semCarimbo = ids.filter((h) => !h.sync_pausado_em).map((h) => h.id)
  if (semCarimbo.length > 0) {
    await admin
      .from("holdings")
      .update({ sync_pausado_em: new Date().toISOString() })
      .in("id", semCarimbo)
  }

  const { data: unidades } = await admin
    .from("units")
    .select("id, brands!inner(holding_id)")
    .in(
      "brands.holding_id",
      ids.map((h) => h.id),
    )

  return new Set(((unidades ?? []) as { id: string }[]).map((u) => u.id))
}

/**
 * Retoma o sync de um cliente que voltou a pagar, RECUPERANDO a lacuna.
 *
 * ── O PEDIDO (Marcus, 18/08/26) ──────────────────────────────────────────
 * "retomando da data que parou até o dia da retomada para colocar os dados
 * 100% íntegros". Voltar a sincronizar só o dia de hoje deixaria um buraco no
 * histórico — e buraco de dado não avisa que existe: o DRE do mês fecharia
 * menor e ninguém saberia por quê.
 *
 * ⚠️ A recuperação NÃO refaz só a janela parada — ela recoloca a loja na fila
 * de histórico (`historico_backfill_at = null`), que puxa desde jan/2026.
 * Parece exagero e é de propósito:
 *  • é a MESMA máquina que já traz o histórico de loja nova, testada e com
 *    retentativa; uma rotina só pra "de X até Y" seria código novo no caminho
 *    mais sensível do sistema, pra rodar poucas vezes por ano;
 *  • janela calculada erra por um dia com facilidade (fuso, competência que
 *    vira no dia 1º), e um dia faltando é exatamente o que ninguém percebe;
 *  • o extrato é substituído por competência, então repuxar mês já existente
 *    não duplica nada.
 * O custo é chamada de API numa reativação, que é evento raro. A integridade
 * vale mais que a economia.
 */
export async function retomarSyncDoCliente(holdingId: string): Promise<{
  pausadoEm: string | null
  lojas: number
}> {
  const admin = createAdminClient()

  const { data: h } = await admin
    .from("holdings")
    .select("sync_pausado_em")
    .eq("id", holdingId)
    .maybeSingle()

  const pausadoEm = (h?.sync_pausado_em as string | null) ?? null
  // Sem carimbo não houve pausa — cliente que pagou em dia não tem lacuna, e
  // enfileirar backfill aqui puxaria o ano inteiro à toa toda vez que alguém
  // paga a mensalidade.
  if (!pausadoEm) return { pausadoEm: null, lojas: 0 }

  const { data: unidades } = await admin
    .from("units")
    .select("id, brands!inner(holding_id)")
    .eq("brands.holding_id", holdingId)
  const unitIds = ((unidades ?? []) as { id: string }[]).map((u) => u.id)

  if (unitIds.length > 0) {
    await admin
      .from("unit_platforms")
      .update({ historico_backfill_at: null, historico_tentativas: 0 })
      .in("unit_id", unitIds)
      .eq("platform", "ifood")
      .not("api_store_id", "is", null)
  }

  await admin
    .from("holdings")
    .update({ sync_pausado_em: null })
    .eq("id", holdingId)

  return { pausadoEm, lojas: unitIds.length }
}
