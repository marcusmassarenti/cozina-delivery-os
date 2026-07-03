import { HelpCenter } from "./_components/help-center"

export const metadata = { title: "Central de ajuda" }

export default function AjudaPage() {
  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <HelpCenter />
    </div>
  )
}
