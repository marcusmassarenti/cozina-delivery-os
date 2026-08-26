import "server-only"

/**
 * Avisa o dono da plataforma que uma loja autorizou o nosso app no 99 Food.
 *
 * ── POR QUE ISSO FALTAVA (Marcus, 25/08/26) ──────────────────────────────
 * "como consigo ver se uma loja conectou na 99 ou no cardapioweb? sem o
 *  usuario me avisar?"
 *
 * O Cardápio Web já resolvia isso desde 04/08: a autorização volta pro NOSSO
 * servidor (o `code` do OAuth bate no callback), e o `avisarInstalacaoNova`
 * manda o e-mail no mesmo segundo.
 *
 * O 99 não tem esse retorno — quem descobre é a varredura diária
 * (`sincronizarLojas99`, dentro do cron `ninefood-sync`). Só que o resultado
 * dela morria no JSON da resposta do cron: `novas` e `semVinculo` existiam,
 * ninguém lia. Na prática o Marcus só sabia de loja nova indo olhar à mão —
 * foi assim que a Marmitex Faisão apareceu, em 24/08/26.
 *
 * Descobrir sem contar a ninguém é o mesmo ponto cego que a varredura veio
 * consertar, um degrau acima.
 *
 * ── UMA VEZ POR LOJA, SEM CARIMBO NOVO ───────────────────────────────────
 * O gatilho é `novas` — os slugs que ACABARAM de ser inseridos em
 * `ninefood_store_links` nesta rodada. Como o insert acontece uma vez só, o
 * aviso também. Não precisa de coluna de "avisado em", e não tem como virar
 * e-mail diário repetido (que é o jeito garantido de o Marcus parar de ler).
 *
 * A contrapartida honesta: se o e-mail falhar, aquela loja não gera outro. Por
 * isso a pendência de verdade — "autorizada e sem loja apontada" — mora também
 * no relatório de saúde, que repete todo dia até alguém resolver.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEmail } from "@/lib/email/enviar"
import type { Sincronizacao99 } from "./lojas"

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"
/**
 * Monta o aviso sem mandar nada.
 *
 * Separado do envio de propósito: a chave do Resend no `.env.local` é a de
 * PRODUÇÃO, então qualquer teste local que chamasse o envio mandaria e-mail de
 * verdade. Com a montagem isolada dá pra conferir o texto e os nomes das lojas
 * sem disparar nada — que é como este arquivo foi verificado em 25/08/26.
 *
 * Devolve null quando não há o que avisar.
 */
export async function montarAviso99(
  r: Sincronizacao99,
): Promise<{ assunto: string; html: string } | null> {
  if (r.novas.length === 0) return null

  const admin = createAdminClient()

  // Quem ganhou unidade automaticamente (casamento por shop_id) e quem não.
  // O nome da loja é o que faz o e-mail valer: "dg-donnatatta-01 autorizou"
  // não diz nada a quem não decorou os slugs.
  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
    .in("app_shop_id", r.novas)

  /**
   * ⚠️ A LISTA PARTE DE `r.novas`, NÃO DO RESULTADO DA CONSULTA.
   *
   * Partia do `links` e isso apagava loja: slug que a consulta não devolvesse
   * (linha apagada no meio do caminho, RLS, erro de rede) simplesmente sumia
   * do e-mail, e o aviso saía dizendo "3 lojas autorizaram" listando 2 — sem
   * nenhum sinal de que faltou uma. Peguei em 25/08/26 testando com um slug
   * inexistente: ele evaporou e o assunto ainda afirmou "já entraram".
   *
   * É o mesmo erro que já custou caro neste projeto três vezes: tratar "não
   * consegui ler" como "não existe". Quem está em `novas` acabou de ser
   * inserido; se não consigo o dono dele, o certo é mostrar como pendente e
   * deixar alguém olhar — nunca omitir.
   */
  const donoDe = new Map(
    ((links ?? []) as { app_shop_id: string; unit_id: string | null }[]).map(
      (l) => [l.app_shop_id, l.unit_id],
    ),
  )
  const linhas = r.novas.map((slug) => ({
    slug,
    unitId: donoDe.get(slug) ?? null,
  }))

  const unitIds = linhas.map((l) => l.unitId).filter((v): v is string => !!v)
  const nomes = new Map<string, { loja: string; cliente: string }>()
  if (unitIds.length > 0) {
    const { data: us } = await admin
      .from("units")
      .select("id, code, name, brand_id")
      .in("id", unitIds)
    const brandIds = ((us ?? []) as { brand_id: string | null }[])
      .map((u) => u.brand_id)
      .filter((v): v is string => !!v)
    const { data: bs } = brandIds.length
      ? await admin.from("brands").select("id, holding_id").in("id", brandIds)
      : { data: [] }
    const holdingIds = ((bs ?? []) as { holding_id: string }[]).map(
      (b) => b.holding_id,
    )
    const { data: hs } = holdingIds.length
      ? await admin.from("holdings").select("id, name").in("id", holdingIds)
      : { data: [] }
    const brandHolding = new Map(
      ((bs ?? []) as { id: string; holding_id: string }[]).map((b) => [
        b.id,
        b.holding_id,
      ]),
    )
    const holdingNome = new Map(
      ((hs ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]),
    )
    for (const u of (us ?? []) as {
      id: string
      code: string | null
      name: string
      brand_id: string | null
    }[]) {
      nomes.set(u.id, {
        loja: `${u.code ? `${u.code} · ` : ""}${u.name}`,
        cliente:
          holdingNome.get(brandHolding.get(u.brand_id ?? "") ?? "") ??
          "cliente não identificado",
      })
    }
  }

  const comLoja = linhas.filter((l) => l.unitId && nomes.has(l.unitId))
  const semLoja = linhas.filter((l) => !l.unitId || !nomes.has(l.unitId))

  const { autorizacao99 } = await import("@/lib/email/templates")
  const { assunto, html } = autorizacao99({
    autorizadas: r.autorizadas,
    comLoja: comLoja.map((l) => ({
      loja: nomes.get(l.unitId!)!.loja,
      cliente: nomes.get(l.unitId!)!.cliente,
      slug: l.slug,
    })),
    semLoja: semLoja.map((l) => ({ slug: l.slug })),
  })

  return { assunto, html }
}

export async function avisarAutorizacao99(r: Sincronizacao99): Promise<void> {
  const aviso = await montarAviso99(r)
  if (!aviso) return
  await enviarEmail({
    holdingId: null,
    tipo: "99-autorizada",
    para: DESTINO,
    assunto: aviso.assunto,
    html: aviso.html,
  })
}
