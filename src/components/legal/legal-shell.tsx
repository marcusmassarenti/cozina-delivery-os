import Link from "next/link"

/** Layout compartilhado das páginas legais (Termos, Privacidade). Público. */
export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string
  updatedAt: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-4">
          <Link href="/login" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cozina-logo.png" alt="Cozina" className="h-8 w-auto" />
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Última atualização: {updatedAt}
        </p>

        <div className="legal-prose mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground/90">
          {children}
        </div>

        <div className="mt-12 flex gap-4 border-t pt-6 text-sm">
          <Link
            href="/termos"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Termos de Uso
          </Link>
          <Link
            href="/privacidade"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Política de Privacidade
          </Link>
        </div>
      </main>
    </div>
  )
}

/** Seção com título + parágrafos/itens. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">
        {n}. {title}
      </h2>
      <div className="flex flex-col gap-2 text-muted-foreground">{children}</div>
    </section>
  )
}
