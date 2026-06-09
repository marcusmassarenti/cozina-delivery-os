import { Building2, Coins, Layers, Sparkles, type LucideIcon } from "lucide-react"

import { CHANGELOG, type Release } from "@/lib/changelog"

import { ChangeItem } from "./_components/change-item"

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]
function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} de ${y}`
}

const AREA_ICON: Record<string, LucideIcon> = {
  "Fluxo de Caixa": Coins,
  "Clientes da plataforma": Building2,
}

export default function NovidadesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-6 text-primary" />
          Novidades & Atualizações
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tudo o que mudou no sistema, da versão mais nova para a mais antiga.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-4">
        {CHANGELOG.map((release) => (
          <ReleaseCard key={release.version} release={release} />
        ))}
        {CHANGELOG.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma novidade registrada ainda.
          </p>
        )}
      </div>
    </div>
  )
}

function ReleaseCard({ release }: { release: Release }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
          v{release.version}
        </span>
        <span className="text-sm text-muted-foreground">{fmtData(release.date)}</span>
        {release.tag && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {release.tag}
          </span>
        )}
      </div>

      <h2 className="mt-2.5 text-lg font-semibold tracking-tight">{release.title}</h2>
      {release.summary && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{release.summary}</p>
      )}

      <div className="mt-4 space-y-4">
        {release.areas.map((area) => {
          const AreaIcon = AREA_ICON[area.area] ?? Layers
          return (
            <div key={area.area}>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <AreaIcon className="size-4" />
                </div>
                {area.area}
              </div>
              <div className="space-y-1.5">
                {area.items.map((item, i) => (
                  <ChangeItem key={i} item={item} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
