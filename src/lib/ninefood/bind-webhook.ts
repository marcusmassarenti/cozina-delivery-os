import "server-only"

/**
 * O webhook `shopBindStatus` do 99 — vínculo (e desvínculo) em segundos.
 *
 * ── POR QUE ISSO PRECISOU EXISTIR (04/09/26) ─────────────────────────────
 * O 99 avisa NO INSTANTE em que uma loja é vinculada ou desvinculada, e o
 * evento já chegava no nosso endpoint desde 11/jun — 25 eventos, todos
 * ignorados. A detecção dependia da varredura das 8h, então o cliente
 * autorizava e a loja aparecia até 24 horas depois.
 *
 * O caso que mostrou o custo: em 01/09 as 8 lojas do Le Brunch vincularam, o
 * 99 mandou os 8 eventos na hora, e ninguém agiu. O Marcus é que pediu
 * "verifique se vincularam" e o vínculo foi feito à mão. Em 04/09 aconteceu
 * de novo com 8 lojas da DG FOODS. A informação estava no banco nas duas.
 *
 * ── COMO A LOJA É IDENTIFICADA ───────────────────────────────────────────
 * O evento traz só o `app_shop_id`. Ele é o identificador DA NOSSA ponta e
 * hoje é digitado à mão no portal (`dg-kawaii-01`), mas no fluxo
 * self-service quem gera é o 99, e sai um UUID
 * (`b2a0e81c-3af9-44c1-9a5f-6ea112d91918`, exemplo da própria doc). Por isso
 * NÃO dá pra deduzir a loja do nome do slug.
 *
 * A resolução é sempre a mesma corrente, que funciona nos dois formatos:
 *
 *     app_shop_id → (lista do 99) shop_id → unit_platforms.external_store_id
 *
 * `shop_id` é o identificador do 99 e é o único elo estável. Quando ele não
 * está no cadastro da unidade, o vínculo nasce SEM DONO de propósito: chutar
 * a loja mistura o faturamento de dois lojistas, que é muito pior do que
 * alguém apontar depois. O órfão fica visível pra ser resolvido.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { listarLojas99 } from "./lojas"

export type EventoBind = {
  id: string
  event_type: string | null
  payload: Record<string, unknown> | null
}

export type ResultadoBind = {
  vinculadas: { appShopId: string; unitId: string; unitName?: string }[]
  desvinculadas: { appShopId: string; unitName?: string }[]
  orfas: { appShopId: string; shopId: string | null; motivo: string }[]
  erros: string[]
}

/** Lê `data.appShopIDList` (e as variações de caixa que o 99 já usou). */
function lojasDoEvento(payload: Record<string, unknown> | null): string[] {
  const data = (payload?.data ?? {}) as Record<string, unknown>
  const bruto =
    data.appShopIDList ?? data.appShopIdList ?? data.app_shop_id_list ?? null
  if (Array.isArray(bruto)) return bruto.map((x) => String(x)).filter(Boolean)
  // Formato de 1 loja só (o `shopStatus` usa assim; o bind pode vir igual).
  const um = data.app_shop_id ?? payload?.app_shop_id
  return um ? [String(um)] : []
}

function statusDoEvento(payload: Record<string, unknown> | null): string {
  const data = (payload?.data ?? {}) as Record<string, unknown>
  return String(data.bindStatus ?? data.bind_status ?? "").toLowerCase()
}

/**
 * Processa os eventos `shopBindStatus` de uma rodada.
 *
 * Não lança: uma falha aqui não pode derrubar o processamento dos pedidos,
 * que roda no mesmo cron. O que falhar volta em `erros` e o evento NÃO é
 * marcado como processado por quem chamou — na próxima rodada tenta de novo.
 */
export async function processarShopBindStatus(
  eventos: EventoBind[],
): Promise<ResultadoBind> {
  const out: ResultadoBind = {
    vinculadas: [],
    desvinculadas: [],
    orfas: [],
    erros: [],
  }
  const alvo = eventos.filter((e) => e.event_type === "shopBindStatus")
  if (alvo.length === 0) return out

  const admin = createAdminClient()

  /* A lista do 99 é buscada UMA vez por rodada, e só se houver evento.
   * É ela que dá o `shop_id` de cada `app_shop_id` — o elo que permite achar
   * a unidade sem depender do formato do slug. */
  let shopIdPorAppShop = new Map<string, string>()
  try {
    const lojas = await listarLojas99()
    /* ⚠️ LISTA VAZIA É "NÃO SEI", NUNCA "NENHUMA LOJA".
     *
     * O 99 limita a listagem a 1 chamada a cada ~20s e, no estouro, responde
     * SEM erro e com lista vazia. Sem esta guarda, uma 2ª rodada no mesmo
     * minuto não resolvia nada e o código concluía "essas lojas não existem".
     * Aconteceu comigo em 04/09/26, no teste: 16 vínculos bons viraram órfãos
     * de uma vez. É a mesma doença de sempre — ausência de dado lida como
     * dado. Sem lista, não se decide nada. */
    if (lojas.length === 0) {
      out.erros.push(
        "o 99 devolveu lista vazia (provável limite de chamadas) — nada foi alterado",
      )
      return out
    }
    shopIdPorAppShop = new Map(lojas.map((l) => [l.appShopId, l.shopId]))
  } catch (e) {
    // Sem a lista não dá pra resolver com segurança. Devolve erro e deixa os
    // eventos para a próxima rodada — a varredura das 8h continua de rede.
    out.erros.push(
      `listarLojas99 falhou: ${e instanceof Error ? e.message : String(e)}`,
    )
    return out
  }

  // Cadastro: shop_id do 99 → unidade. Só vale quando aponta pra UMA.
  const { data: plats } = await admin
    .from("unit_platforms")
    .select("unit_id, external_store_id, units!inner(name)")
    .eq("platform", "99food")
    .not("external_store_id", "is", null)
  const unitPorShopId = new Map<string, { id: string; nome: string }[]>()
  for (const p of (plats ?? []) as unknown as {
    unit_id: string
    external_store_id: string
    units: { name: string } | null
  }[]) {
    const lista = unitPorShopId.get(p.external_store_id) ?? []
    lista.push({ id: p.unit_id, nome: p.units?.name ?? "" })
    unitPorShopId.set(p.external_store_id, lista)
  }

  /** Vínculos que nasceram com dono nesta rodada — rodam backfill no fim. */
  const paraBackfill: string[] = []

  for (const ev of alvo) {
    const status = statusDoEvento(ev.payload)
    const lojas = lojasDoEvento(ev.payload)
    if (lojas.length === 0) {
      out.erros.push(`evento ${ev.id}: sem appShopIDList`)
      continue
    }

    for (const appShopId of lojas) {
      try {
        if (status === "unbind") {
          /* DESVINCULOU: desativa em vez de apagar.
           * O histórico já importado continua valendo — o que muda é que a
           * loja para de ser cobrada por dado novo. Apagar o vínculo faria o
           * faturamento passado sumir da tela sem explicação. */
          const { data: link } = await admin
            .from("ninefood_store_links")
            .update({ active: false })
            .eq("app_shop_id", appShopId)
            .select("unit_id, units:unit_id(name)")
            .maybeSingle()
          out.desvinculadas.push({
            appShopId,
            unitName: (link as { units?: { name?: string } } | null)?.units?.name,
          })
          continue
        }

        if (status !== "bind") continue

        const shopId = shopIdPorAppShop.get(appShopId) ?? null
        const candidatas = shopId ? unitPorShopId.get(shopId) ?? [] : []
        // Duas unidades com o mesmo shop_id é erro de cadastro: não escolhe.
        const unidade = candidatas.length === 1 ? candidatas[0]! : null

        /* ⚠️ NUNCA ESCREVER NULO POR CIMA DE VÍNCULO BOM.
         *
         * O upsert antigo mandava `unit_id: unidade?.id ?? null` — quando a
         * resolução falhava, ele APAGAVA o dono de um vínculo que estava
         * certo. Foi assim que 16 lojas viraram órfãs no teste de 04/09/26.
         *
         * Agora: só grava o que foi realmente resolvido. Vínculo que já
         * existe e não resolveu agora fica exatamente como estava. */
        const campos: Record<string, unknown> = { active: true }
        if (shopId) campos.id_loja = shopId
        if (unidade) campos.unit_id = unidade.id

        const { data: existente } = await admin
          .from("ninefood_store_links")
          .select("unit_id")
          .eq("app_shop_id", appShopId)
          .maybeSingle()

        const { error } = existente
          ? await admin
              .from("ninefood_store_links")
              .update(campos)
              .eq("app_shop_id", appShopId)
          : await admin
              .from("ninefood_store_links")
              .insert({ app_shop_id: appShopId, ...campos })
        if (error) {
          out.erros.push(`${appShopId}: ${error.message}`)
          continue
        }

        // Já tinha dono e a rodada não mudou nada: não é órfã nem novidade.
        if (!unidade && existente?.unit_id) continue

        if (!unidade) {
          out.orfas.push({
            appShopId,
            shopId,
            motivo: !shopId
              ? "o 99 ainda não lista esta loja"
              : candidatas.length > 1
                ? `${candidatas.length} unidades com o mesmo shop_id`
                : "nenhuma unidade com este shop_id no cadastro",
          })
          continue
        }

        /* Carimba o shop_id no cadastro se faltava. Faz o vínculo seguinte
         * desta loja resolver sozinho, e é o que evita órfão no fluxo
         * self-service (onde o slug é um UUID que não diz nada). */
        await admin
          .from("unit_platforms")
          .update({ external_store_id: shopId })
          .eq("unit_id", unidade.id)
          .eq("platform", "99food")
          .is("external_store_id", null)

        out.vinculadas.push({
          appShopId,
          unitId: unidade.id,
          unitName: unidade.nome,
        })
        paraBackfill.push(appShopId)
      } catch (e) {
        out.erros.push(
          `${appShopId}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }

  /* BACKFILL NA HORA — mesma regra dos outros caminhos de vínculo (Marcus,
   * 18/08/26): "loja vinculada tem que rodar backfill imediato". Sem isto o
   * vínculo nasce mudo e a loja fica zerada até o cron da madrugada. */
  for (const appShopId of paraBackfill) {
    try {
      const { backfillDeUmaLoja99 } = await import("./backfill")
      await backfillDeUmaLoja99(appShopId)
    } catch (e) {
      // Não derruba o vínculo: o `backfillHistorico99` recolhe depois.
      console.error(`[99] backfill de ${appShopId} falhou:`, e)
    }
  }

  return out
}
