import { AlertTriangle, Award, Star } from "lucide-react"
import Link from "next/link"

import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { createAdminClient } from "@/lib/supabase/admin"
import { fmtCriterio, getSuperCriterios, METAS_SUPER } from "@/lib/data/super"
import { PlatformLogo } from "@/components/platform-logo"
import { SuperBadge } from "@/components/shared/super-badge"
import { fmtNum, fmtPct } from "@/lib/format"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { LojaSelector } from "./_components/loja-selector"

/**
 * Super Restaurante — a rede inteira numa tela.
 *
 * O painel do iFood mostra uma loja por vez. Numa rede, a pergunta é outra:
 * quem está prestes a perder o selo, e o que é problema de PADRÃO em vez de
 * problema de loja. As duas só aparecem juntando.
 *
 * ⚠️ Cobre só as lojas com o relatório importado, e isso fica dito na tela.
 * Medido em 10/08/26: 12 lojas de 76, todas do Churrasco no Pote — a DG, com
 * 47, não tem nenhuma. Sem esse aviso o relatório parece a rede toda.
 *
 * Não há API pro Super (varrido em 18 specs do iFood: zero ocorrência), então
 * a atualização depende de alguém subir o arquivo depois do dia 10.
 */
export default async function RelatorioSuperPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  await assertCanView("relatorios")
  const { loja: lojaParam } = await searchParams

  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()
  let q = admin
    .from("units")
    .select("id, code, name")
    .eq("active", true)
    .order("name")
  if (allowed !== null) {
    if (allowed.length === 0) return <Vazio total={0} />
    q = q.in("id", allowed)
  }
  const { data: units } = await q
  const lojas = units ?? []
  const mapa = await getSuperCriterios(lojas.map((u) => u.id))

  const todas = lojas
    .map((u) => ({ unit: u, s: mapa.get(u.id) }))
    .filter((l): l is { unit: (typeof lojas)[number]; s: NonNullable<ReturnType<typeof mapa.get>> } => !!l.s)

  if (todas.length === 0) return <Vazio total={lojas.length} />

  // Filtro de loja é só de EXIBIÇÃO: os KPIs e a leitura de rede continuam
  // sobre todas. Recortar tudo faria "1 de 1 loja é Super", que não informa.
  const foco = lojaParam
    ? (todas.find((l) => l.unit.code === lojaParam) ?? null)
    : null
  const linhas = foco ? [foco] : todas

  const superOk = todas.filter((l) => l.s.eSuper)
  const naoElegivel = todas.filter((l) => !l.s.eElegivel)
  const subindo = todas.filter((l) => l.s.eElegivel && !l.s.eSuper)
  const risco = todas
    .filter((l) => l.s.eSuper && l.s.emRisco.length > 0)
    .sort((a, b) => b.s.emRisco.length - a.s.emRisco.length)
  const dias = todas[0]!.s.diasAteRecalculo

  // Tag negativa somada na rede: se "embalagem" aparece em 8 lojas, o problema
  // é de padrão, não daquela loja. Só dá pra ver junto.
  const tagsRede = new Map<string, { total: number; lojas: number }>()
  for (const l of linhas) {
    for (const [tag, n] of Object.entries(l.s.tagsNeg)) {
      const at = tagsRede.get(tag) ?? { total: 0, lojas: 0 }
      tagsRede.set(tag, { total: at.total + n, lojas: at.lojas + 1 })
    }
  }
  const topTags = [...tagsRede.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)

  const chamados = linhas.reduce(
    (a, l) => ({
      atraso: a.atraso + l.s.chamados.atraso,
      itemErrado: a.itemErrado + l.s.chamados.itemErrado,
      posEntrega: a.posEntrega + l.s.chamados.posEntrega,
    }),
    { atraso: 0, itemErrado: 0, posEntrega: 0 },
  )

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformLogo platform="ifood" className="size-5 rounded-[5px]" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Super Restaurante
            {foco ? ` · ${foco.unit.name}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {todas.length} de {lojas.length} lojas com o relatório importado ·
            o iFood recalcula o selo todo dia 10
            {dias === 0 ? " — é hoje" : `, faltam ${dias} dias`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2" data-print="hide">
          <LojaSelector
            lojas={todas.map((l) => ({
              code: l.unit.code,
              name: l.unit.name,
            }))}
            atual={lojaParam ?? null}
          />
          <ExportPdfButton />
        </div>
      </div>

      {/* Loja escolhida: o plano de ação e os elogios/reclamações dela, que
          na visão de rede não cabem — são texto por loja. */}
      {foco && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{foco.unit.name}</h2>
            <SuperBadge
              nivel={foco.s.nivel}
              eSuper={foco.s.eSuper}
              eElegivel={foco.s.eElegivel}
              tamanho="sm"
              titulo={foco.s.periodoOficial ?? undefined}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi rotulo="Pedidos totais" valor={foco.s.totalPedidos} />
            <Kpi
              rotulo="Cancelamentos da loja"
              valor={foco.s.cancelamentosDaLoja}
            />
            <Kpi rotulo="Chamados válidos" valor={foco.s.chamados.total} />
            <Kpi rotulo="Avaliações" valor={foco.s.criterios[1]?.valor ?? 0} />
          </div>
          {foco.s.planoDeAcao && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[12px] leading-relaxed">
              <strong>Plano de ação do iFood:</strong> {foco.s.planoDeAcao}
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Tags titulo="O cliente elogiou" tags={foco.s.tagsPos} tom="emerald" />
            <Tags titulo="O cliente reclamou" tags={foco.s.tagsNeg} tom="rose" />
          </div>
        </section>
      )}

      {todas.length < lojas.length && (
        <p className="rounded-lg border-l-4 border-sky-500 bg-sky-50 px-3 py-2 text-[12px] leading-relaxed text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
          <strong>{lojas.length - todas.length} lojas ficaram de fora</strong>{" "}
          porque não têm o relatório Super importado. Não existe API para esse
          dado — ele precisa ser exportado do Portal do Parceiro de cada conta e
          subido em <Link href="/importacao" className="underline">Importação</Link>.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="São Super" valor={superOk.length} tom="emerald" />
        <Kpi rotulo="No limite" valor={risco.length} tom="amber" />
        <Kpi rotulo="Elegíveis, fora do 5" valor={subindo.length} />
        <Kpi rotulo="Não elegíveis" valor={naoElegivel.length} />
      </div>

      {risco.length > 0 && (
        <section className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-950/20">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-4" />
            Prestes a perder o selo
          </h2>
          <p className="mb-3 text-[12px] text-amber-800/90 dark:text-amber-300/90">
            São Super hoje, mas estão na borda de algum critério. É aqui que
            ainda dá para agir.
          </p>
          <div className="space-y-2">
            {risco.map(({ unit, s }) => (
              <div
                key={unit.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs"
              >
                <Link
                  href={`/unidades/${unit.code}`}
                  className="font-semibold hover:underline"
                >
                  {unit.name}
                </Link>
                {s.emRisco.map((c) => (
                  <span
                    key={c.chave}
                    className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                  >
                    {c.rotulo} {fmtCriterio(c.valor, c.formato)}
                    <span className="ml-1 font-normal opacity-70">
                      (limite {fmtCriterio(c.meta, c.formato)})
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Situação loja a loja</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Loja</th>
                <th className="pb-2 pr-3 font-medium">Selo</th>
                <th className="pb-2 pr-3 text-right font-medium">Total ped.</th>
                <th className="pb-2 pr-3 text-right font-medium">Concluídos</th>
                <th className="pb-2 pr-3 text-right font-medium">Avaliações</th>
                <th className="pb-2 pr-3 text-right font-medium">Nota</th>
                <th className="pb-2 pr-3 text-right font-medium">Cancel.</th>
                <th className="pb-2 pr-3 text-right font-medium">Chamados</th>
                <th className="pb-2 pr-3 text-right font-medium">Cancel. loja</th>
                <th className="pb-2 text-right font-medium">Chamados val.</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ unit, s }) => (
                <tr key={unit.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/unidades/${unit.code}`}
                      className="font-medium hover:underline"
                    >
                      {unit.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <SuperBadge
                      nivel={s.nivel}
                      eSuper={s.eSuper}
                      eElegivel={s.eElegivel}
                      tamanho="sm"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {fmtNum(s.totalPedidos)}
                  </td>
                  {s.criterios.map((c) => (
                    <td
                      key={c.chave}
                      className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                        !c.atingido
                          ? "text-rose-700 dark:text-rose-400"
                          : c.emRisco
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {fmtCriterio(c.valor, c.formato)}
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {fmtNum(s.cancelamentosDaLoja)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {fmtNum(s.chamados.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Metas: ≥ {METAS_SUPER.pedidos} pedidos · ≥ {METAS_SUPER.avaliacoes}{" "}
          avaliações · nota ≥ {METAS_SUPER.nota.toLocaleString("pt-BR")} ·
          cancelamento ≤ {fmtPct(METAS_SUPER.cancelamento)} · chamados ≤{" "}
          {fmtPct(METAS_SUPER.chamados)}. Âmbar = dentro, mas na borda.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {topTags.length > 0 && (
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold">
              {foco ? "O que o cliente reclama" : "O que o cliente reclama, na rede"}
            </h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {foco
                ? "Contagem por dimensão nesta loja."
                : "Tag que aparece em muitas lojas é problema de padrão, não de loja."}
            </p>
            <div className="space-y-1.5">
              {topTags.map(([tag, { total, lojas: n }]) => (
                <div key={tag} className="flex items-center gap-2 text-xs">
                  <span className="capitalize text-muted-foreground">{tag}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground/70">
                    {n} {n === 1 ? "loja" : "lojas"}
                  </span>
                  <span className="w-12 text-right font-bold tabular-nums text-rose-700 dark:text-rose-400">
                    {fmtNum(total)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold">Chamados por natureza</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Atraso é entrega; item errado é cozinha. Dois donos diferentes.
          </p>
          <div className="space-y-1.5 text-xs">
            <LinhaSimples rotulo="Pedidos com atraso" valor={chamados.atraso} />
            <LinhaSimples rotulo="Item errado" valor={chamados.itemErrado} />
            <LinhaSimples rotulo="Após a entrega" valor={chamados.posEntrega} />
          </div>
        </section>
      </div>
    </div>
  )
}

function Tags({
  titulo,
  tags,
  tom,
}: {
  titulo: string
  tags: Record<string, number>
  tom: "emerald" | "rose"
}) {
  const itens = Object.entries(tags).sort((a, b) => b[1] - a[1])
  if (itens.length === 0) return null
  const cor =
    tom === "emerald"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map(([tag, n]) => (
          <span
            key={tag}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cor}`}
          >
            {tag} <span className="font-bold tabular-nums">{fmtNum(n)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string
  valor: number
  tom?: "emerald" | "amber"
}) {
  const cor =
    tom === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tom === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  )
}

function LinhaSimples({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="ml-auto font-bold tabular-nums">{fmtNum(valor)}</span>
    </div>
  )
}

function Vazio({ total }: { total: number }) {
  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex items-center gap-2">
        <Award className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Super Restaurante
        </h1>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <Star className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">
          Nenhuma das {total} lojas tem o relatório Super importado
        </p>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
          Esse dado não vem por API — precisa ser exportado do Portal do
          Parceiro do iFood, em Super, e subido em{" "}
          <Link href="/importacao" className="underline">
            Importação
          </Link>
          . O iFood recalcula o selo todo dia 10, então vale reimportar logo
          depois.
        </p>
      </div>
    </div>
  )
}
