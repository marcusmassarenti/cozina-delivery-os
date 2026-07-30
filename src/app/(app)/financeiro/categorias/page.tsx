import { getCaixaHoldingId, getCategoriesFlat } from "@/lib/data/caixa"

import { CategoriaManager } from "../_components/categoria-manager"

export default async function CategoriasPage() {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const categories = await getCategoriesFlat(holdingId)
  return <CategoriaManager categories={categories} />
}
