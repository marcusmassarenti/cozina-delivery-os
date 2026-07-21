import { redirect } from "next/navigation"

// DRE unificado: o DRE Gerencial do caixa foi fundido no DRE Grupo (/financeiro),
// que agora inclui os custos operacionais do caixa. Mantém o link antigo vivo.
export default function DreRedirect() {
  redirect("/financeiro")
}
