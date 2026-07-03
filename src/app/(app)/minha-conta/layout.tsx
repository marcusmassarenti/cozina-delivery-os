import { ContaTabs } from "./_components/conta-tabs"

/**
 * Central "Minha conta": dados cadastrais, personalização, assinatura e
 * acessos (permissões/usuários) num lugar só, em abas.
 */
export default function MinhaContaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <div className="border-b bg-background px-6 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <ContaTabs />
      </div>
      {children}
    </div>
  )
}
