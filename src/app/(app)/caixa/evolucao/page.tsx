import { redirect } from "next/navigation"

// Evolução do caixa foi fundida no DRE Grupo (/financeiro), que tem o resultado
// por período. Mantém o link antigo vivo.
export default function EvolucaoRedirect() {
  redirect("/financeiro")
}
