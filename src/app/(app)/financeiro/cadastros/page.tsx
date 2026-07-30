import { countContacts, getCaixaHoldingId, getContacts } from "@/lib/data/caixa"

import { CadastrosView } from "../_components/cadastros-view"

export default async function CadastrosPage() {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const contacts = await getContacts(holdingId)
  return <CadastrosView contacts={contacts} counts={countContacts(contacts)} />
}
