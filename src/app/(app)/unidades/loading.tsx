/**
 * Skeleton da tela de Unidades — no formato da TABELA.
 *
 * ── POR QUE ESTA TELA GANHOU O DELA (Marcus, 16/08/26) ───────────────────
 * "quando mudo de página, na hora de ficar carregando fica com essa tela.
 * deveria ser outra?" — deveria. Existia um `loading.tsx` genérico no grupo
 * `(app)` inteiro, desenhado no formato do Dashboard: seis cartões de KPI
 * numa grade e um bloco largo embaixo. Em Unidades ele prometia uma tela que
 * não vinha; a pessoa via seis quadrados e recebia uma lista.
 *
 * Skeleton só ajuda quando ANTECIPA o layout — é isso que faz a página
 * parecer que já chegou. Quando ele mostra outra coisa, atrapalha duas vezes:
 * o olho se organiza pro formato errado e ainda leva um solavanco quando o
 * conteúdo real entra.
 *
 * Por isso ele imita a tabela: aviso de cadastro, barra de filtros, cabeçalho
 * e linhas com a mesma altura das de verdade (~44 px, a do logo).
 *
 * Doze linhas porque é o que cabe numa tela de notebook — desenhar as 50 da
 * página encheria a rolagem de cinza pra nada.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Aviso de cadastro incompleto */}
      <div className="h-14 animate-pulse rounded-lg border bg-card" />

      {/* Título + busca */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Filtros */}
      <div className="h-14 animate-pulse rounded-lg border bg-card" />

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex h-10 items-center gap-4 border-b bg-muted/40 px-3">
          {[52, 40, 140, 120, 110, 80, 70].map((w, i) => (
            <div
              key={i}
              className="h-2.5 animate-pulse rounded bg-muted"
              style={{ width: w }}
            />
          ))}
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-3 py-2 last:border-0"
          >
            <div className="size-7 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-8 animate-pulse rounded bg-muted/70" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="size-5 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />
            <div className="ml-auto flex gap-2">
              <div className="size-4 animate-pulse rounded bg-muted/50" />
              <div className="size-4 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
