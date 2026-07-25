/**
 * Snapshot do cardápio de uma loja do Cardápio Web.
 *
 * `GET /api/partner/v1/catalog` devolve o cardápio INTEIRO numa tacada só —
 * categorias, itens e grupos de complementos aninhados. Não tem paginação, e
 * o teto é de 5 req/min (tier `lento`), então é uma chamada por sincronização.
 *
 * Estrutura real, verificada contra a API (loja 275, 11 categorias / 51 itens):
 *   [ { id, name, description, index, status, image, allowed_times,
 *       items: [ { id, name, description, price, cost_price, external_code,
 *                  status, kind, option_groups[], combo_steps[] ... } ] } ]
 *
 * `kind` vale `regular_item` ou `combo`. Guardamos os dois no mesmo nível: um
 * combo É um item vendável, com preço próprio. O que ele contém
 * (`combo_steps`) não entra aqui — a composição de venda já é resolvida no
 * lado dos PEDIDOS, onde o sub-item aparece com o próprio `external_code`.
 *
 * Por que este snapshot importa: `external_code` é o código do item no PDV/ERP
 * — é a ponte entre o que foi vendido e a ficha técnica (CMV).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import type { CwAmbiente, CwAuthMode } from "./auth"
import { fetchCw } from "./client"

/** Item do cardápio como a API devolve (só o que usamos). */
type CwCatalogItem = {
  id: number | string
  name?: string
  description?: string | null
  price?: number | null
  external_code?: string | null
  status?: string | null
  kind?: string | null
}

type CwCatalogCategory = {
  id: number | string
  name?: string
  status?: string | null
  items?: CwCatalogItem[]
}

export type ResultadoCatalogo = {
  ok: boolean
  categorias: number
  itens: number
  /** Itens com código do PDV — os que amarram na ficha técnica. */
  comCodigoExterno: number
  /** Itens que sumiram do cardápio desde a última sincronização. */
  removidos: number
  erro?: string
}

/** A resposta pode vir como array direto ou embrulhada — aceita as duas. */
function extrairCategorias(data: unknown): CwCatalogCategory[] {
  if (Array.isArray(data)) return data as CwCatalogCategory[]
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>
    for (const chave of ["categories", "data", "categorias"]) {
      if (Array.isArray(d[chave])) return d[chave] as CwCatalogCategory[]
    }
  }
  return []
}

export async function sincronizarCatalogo(
  installId: string,
): Promise<ResultadoCatalogo> {
  const vazio = { categorias: 0, itens: 0, comCodigoExterno: 0, removidos: 0 }
  const admin = createAdminClient()

  const { data: install } = await admin
    .from("cardapioweb_installs")
    .select("id, unit_id, ambiente, auth_mode, active")
    .eq("id", installId)
    .maybeSingle()

  if (!install) return { ok: false, ...vazio, erro: "Instalação não encontrada." }
  if (!install.active) {
    return { ok: false, ...vazio, erro: "Instalação inativa — reconectar a loja." }
  }

  const r = await fetchCw<unknown>({
    installId,
    ambiente: install.ambiente as CwAmbiente,
    authMode: install.auth_mode as CwAuthMode,
    path: "/api/partner/v1/catalog",
    tier: "lento",
    endpointLabel: "GET /catalog",
  })

  if (!r.ok) {
    return {
      ok: false,
      ...vazio,
      erro:
        r.status === 403
          ? "A loja não autorizou o acesso ao catálogo (escopo catalog)."
          : (r.error ?? `Cardápio Web respondeu ${r.status}.`),
    }
  }

  const categorias = extrairCategorias(r.data)

  // Marca o momento ANTES de gravar: no fim, o que ficou com synced_at menor
  // que isso não veio nesta resposta — ou seja, saiu do cardápio.
  const inicio = new Date().toISOString()

  const linhas = categorias.flatMap((c) =>
    (c.items ?? []).map((i) => ({
      install_id: installId,
      unit_id: install.unit_id,
      item_id: String(i.id),
      // A API devolve "" (string vazia) quando o item não tem código de PDV.
      // Guardar isso como texto vazio faria "sem código" parecer "com código"
      // em qualquer JOIN com a ficha técnica — normaliza pra null.
      external_code: i.external_code?.trim() || null,
      categoria_id: String(c.id),
      categoria_nome: c.name ?? null,
      nome: i.name ?? null,
      descricao: i.description ?? null,
      preco: typeof i.price === "number" ? i.price : null,
      // O cardápio usa "ACTIVE"; qualquer outra coisa (PAUSED, INACTIVE…)
      // significa que não está vendendo agora.
      ativo: (i.status ?? "").toUpperCase() === "ACTIVE",
      synced_at: new Date().toISOString(),
    })),
  )

  if (linhas.length === 0) {
    // Catálogo vazio é resposta legítima (loja nova). Não apaga o que existe:
    // uma resposta vazia por engano não pode destruir o snapshot anterior.
    return { ok: true, ...vazio, categorias: categorias.length }
  }

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await admin
      .from("cardapioweb_catalogo_itens")
      .upsert(linhas.slice(i, i + 500), { onConflict: "install_id,item_id" })
    if (error) {
      return {
        ok: false,
        categorias: categorias.length,
        itens: 0,
        comCodigoExterno: 0,
        removidos: 0,
        erro: `Falha ao gravar o catálogo: ${error.message}`,
      }
    }
  }

  // Item que não veio nesta resposta saiu do cardápio — some do snapshot pra
  // não inflar relatório com produto que a loja nem vende mais.
  const { data: apagados } = await admin
    .from("cardapioweb_catalogo_itens")
    .delete()
    .eq("install_id", installId)
    .lt("synced_at", inicio)
    .select("id")

  return {
    ok: true,
    categorias: categorias.length,
    itens: linhas.length,
    comCodigoExterno: linhas.filter((l) => l.external_code).length,
    removidos: (apagados ?? []).length,
  }
}
