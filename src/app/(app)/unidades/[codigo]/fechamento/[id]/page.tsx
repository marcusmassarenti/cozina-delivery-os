import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { getUnitByCode } from "@/lib/data/units"
import { getFechamentoById } from "@/lib/data/fechamentos"
import {
  toAcerto,
  recebidoTotal,
  lucroLiquido,
  computeSplit,
  acertoBreakdown,
} from "@/lib/fechamento-calc"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { fmtBRL } from "@/lib/format"

function fmtData(s: string): string {
  const [y, m, d] = s.split("-")
  return `${d}/${m}/${y}`
}

function signed(n: number): string {
  const s = fmtBRL(Math.abs(n))
  return n < 0 ? `−${s}` : `+${s}`
}

export default async function FechamentoPrintPage({
  params,
}: {
  params: Promise<{ codigo: string; id: string }>
}) {
  const { codigo, id } = await params
  await assertCanView("financeiro")

  const unit = await getUnitByCode(codigo)
  if (!unit) notFound()
  const accessibleIds = await getAccessibleUnitIds()
  if (accessibleIds !== null && !accessibleIds.includes(unit.id)) notFound()

  const f = await getFechamentoById(id)
  if (!f || f.unitId !== unit.id) notFound()

  const recebido = recebidoTotal(f)
  const lucro = lucroLiquido(f)
  const acerto = toAcerto(f.acerto)
  const split = computeSplit(lucro, f.custoVinagrete, acerto)
  const acertoLinhas = acertoBreakdown(acerto)

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl" data-print="page">
        {/* Barra de ações (não entra no PDF) */}
        <div
          className="mb-4 flex items-center justify-between"
          data-print="hide"
        >
          <Link
            href={`/unidades/${codigo}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <ExportPdfButton />
        </div>

        {/* Logo (entra no PDF) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cozina-logo.png" alt="Cozina" className="mb-4 h-10 w-auto" />

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-4 border-b pb-3">
            <h1 className="text-xl font-semibold">
              Fechamento · {unit.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Semana {fmtData(f.periodoInicio)} a {fmtData(f.periodoFim)} ·
              acerto 50/50
            </p>
          </div>

          {/* 1. Recebido */}
          <Secao titulo="1. Recebido das plataformas">
            <Row label="iFood" value={f.recebidoIfood} />
            <Row label="Keeta" value={f.recebidoKeeta} />
            <Row label="99 Food" value={f.recebido99} />
            <Row label="VR (descontado do iFood)" value={f.vr} />
            <Row label="Total recebido" value={recebido} strong />
          </Secao>

          {/* 2. Custos */}
          <Secao titulo="2. Custos da operação">
            <Row label="Produtos (CMV Cozina)" value={-f.custoProdutos} />
            <Row
              label="Vinagrete / maionese / bebidas"
              value={-f.custoVinagrete}
            />
          </Secao>

          {/* 3. Lucro + base ÷ 2 */}
          <div className="my-4 rounded-lg bg-primary/5 p-4">
            <Row label="Lucro líquido" value={lucro} strong big />
            <div className="mt-1 text-xs text-muted-foreground">
              Lucro ÷ 2 = {fmtBRL(split.half)} pra cada
              {f.custoVinagrete > 0 && (
                <> · vinagrete {fmtBRL(f.custoVinagrete)} volta inteiro pro JK</>
              )}{" "}
              (antes dos acertos)
            </div>
          </div>

          {/* 4. Acerto */}
          {acertoLinhas.length > 0 && (
            <Secao titulo="4. Acerto / repasse">
              {acertoLinhas.map((l) => (
                <div
                  key={l.key}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{l.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    JK {signed(l.jk)} · Cozina {signed(l.cozina)}
                  </span>
                </div>
              ))}
              {acerto.outrosObs && (
                <div className="text-xs text-muted-foreground">
                  Outros: {acerto.outrosObs}
                </div>
              )}
            </Secao>
          )}

          {/* 5. Resultado final */}
          <div className="my-4 grid grid-cols-2 gap-3 rounded-lg bg-primary/10 p-4">
            <div>
              <div className="text-xs text-muted-foreground">JK recebe</div>
              <div className="text-xl font-semibold tabular-nums">
                {fmtBRL(split.jk)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cozina recebe</div>
              <div className="text-xl font-semibold tabular-nums">
                {fmtBRL(split.cozina)}
              </div>
            </div>
          </div>

          {f.observacoes && (
            <div className="mt-4 border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                Observações
              </div>
              <p className="mt-1 text-sm">{f.observacoes}</p>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Cozina Foods · documento gerado pelo Cozina Delivery OS
        </p>
      </div>
    </div>
  )
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  big,
}: {
  label: string
  value: number
  strong?: boolean
  big?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${strong ? "font-semibold" : ""} ${big ? "text-base" : "text-sm"}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${big ? "text-base" : "text-sm"}`}
      >
        {fmtBRL(value)}
      </span>
    </div>
  )
}
