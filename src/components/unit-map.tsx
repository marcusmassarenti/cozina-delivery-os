import { ExternalLink, MapPin } from "lucide-react"

/**
 * Mapa estático via embed do Google Maps. Não requer API key.
 * Usa cidade + UF (e nome da loja) como query. Quando tivermos campo
 * de endereço completo, trocamos a query por ele.
 */
export function UnitMap({
  unitName,
  city,
  state,
}: {
  unitName: string
  city: string | null
  state: string | null
}) {
  if (!city || !state) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <MapPin className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Sem localização</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adicione cidade e UF na edição da unidade pra ver o mapa.
        </p>
      </div>
    )
  }

  const query = `${unitName}, ${city}, ${state}, Brasil`
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Localização
          </span>
        </div>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Abrir no Google Maps
          <ExternalLink className="size-3" />
        </a>
      </div>
      <iframe
        src={src}
        title={`Mapa: ${unitName}`}
        className="h-72 w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  )
}
