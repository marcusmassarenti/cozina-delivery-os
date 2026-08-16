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
