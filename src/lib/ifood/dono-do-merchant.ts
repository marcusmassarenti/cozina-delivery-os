import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Como o dono foi deduzido. A tela mostra: nem toda pista tem o mesmo peso. */
export type ViaDeducao = "cnpj" | "raiz" | "razao"

export type DonoDeduzido = {
  id: string
  name: string
  via: ViaDeducao
}

const soDigitos = (s: string | null | undefined) =>
  String(s ?? "").replace(/\D/g, "")

/**
 * A raiz do CNPJ (8 primeiros dígitos) escondida na razão social.
 *
 * O iFood devolve `corporate_name` de MEI e pessoa física no formato
 * "50.242.972 FERNANDA DREHER DE CASTRO" — a raiz do CNPJ vem no começo do
 * texto, mesmo quando a coluna `cnpj` do merchant está vazia. Era dono
 * identificável que a tela tratava como desconhecido.
 */
function raizNaRazaoSocial(razao: string | null): string | null {
  const m = /^(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})/.exec((razao ?? "").trim())
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/**
 * De quem é cada merchant do iFood — por CNPJ, por raiz de CNPJ, ou pela
 * razão social.
 *
 * ── POR QUE TRÊS CAMINHOS E NÃO UM ──────────────────────────────────────
 * A versão anterior deduzia só por CNPJ completo vindo da solicitação de
 * conexão. Quando não achava, o seletor de vínculo abria com as unidades da
 * BASE INTEIRA — e foi assim que a tela chegou a oferecer "CR Poços", do
 * Churrasco Royal, na linha de um merchant da DG FOODS. Vincular ali mistura
 * o faturamento de dois clientes, que é o pior erro possível nesta tela.
 *
 * Os três caminhos, em ordem de confiança:
 *
 *  1. `cnpj`  — CNPJ completo (14 dígitos) bate com uma solicitação ou com o
 *               cadastro de uma unidade.
 *  2. `raiz`  — os 8 primeiros dígitos batem. Mesma empresa, filial diferente.
 *               A raiz vem da coluna `cnpj` ou de dentro da razão social.
 *  3. `razao` — razão social idêntica à de outro merchant JÁ identificado por
 *               (1) ou (2). É o caso de "PARMEGIANA CROCANTE JARDINS LTDA",
 *               que tem quatro merchants e CNPJ preenchido em só um deles.
 *
 * ⚠️ A ORDEM IMPORTA e o mais forte ganha: um merchant com CNPJ completo
 * conhecido nunca é reclassificado por razão social parecida.
 *
 * ⚠️ Empate NÃO vira palpite. Se dois clientes diferentes reivindicam a mesma
 * pista, o merchant fica SEM dono — e a tela pede que a pessoa escolha. Chutar
 * aqui é pior que não saber, porque o chute vem com cara de resposta.
 *
 * A unidade cadastrada entrou como fonte junto com a solicitação: cliente que
 * cadastrou a loja antes de pedir a conexão (o caminho normal) não tinha
 * solicitação nenhuma pra casar.
 */
export async function donosDosMerchants(): Promise<
  Record<string, DonoDeduzido>
> {
  const admin = createAdminClient()

  const [pedidos, unidades, merchants] = await Promise.all([
    admin.from("ifood_activation_requests").select("cnpj, holding_id, holdings(name)"),
    admin.from("units").select("cnpj, brands!inner(holding_id, holdings!inner(name))"),
    admin.from("ifood_merchants").select("id, cnpj, corporate_name"),
  ])

  /** pista (cnpj ou raiz) → dono, ou `null` quando dois clientes brigam por ela. */
  const porPista = new Map<string, { id: string; name: string } | null>()

  const anota = (pista: string, dono: { id: string; name: string }) => {
    if (!pista) return
    const atual = porPista.get(pista)
    if (atual === undefined) {
      porPista.set(pista, dono)
      return
    }
    // Já marcado como conflito, ou conflito novo: some dos dois jeitos.
    if (atual === null || atual.id !== dono.id) porPista.set(pista, null)
  }

  for (const r of (pedidos.data ?? []) as unknown as {
    cnpj: string | null
    holding_id: string | null
    holdings: { name: string } | null
  }[]) {
    const cnpj = soDigitos(r.cnpj)
    if (cnpj.length !== 14 || !r.holding_id) continue
    anota(cnpj, { id: r.holding_id, name: r.holdings?.name ?? "—" })
  }

  for (const u of (unidades.data ?? []) as unknown as {
    cnpj: string | null
    brands: { holding_id: string; holdings: { name: string } }
  }[]) {
    const cnpj = soDigitos(u.cnpj)
    if (cnpj.length !== 14 || !u.brands?.holding_id) continue
    anota(cnpj, { id: u.brands.holding_id, name: u.brands.holdings?.name ?? "—" })
  }

  // A raiz só se resolve DEPOIS de todos os CNPJs completos: duas filiais do
  // mesmo grupo compartilham raiz e não podem virar conflito entre si.
  const porRaiz = new Map<string, { id: string; name: string } | null>()
  for (const [pista, dono] of porPista) {
    if (pista.length !== 14) continue
    const raiz = pista.slice(0, 8)
    const atual = porRaiz.get(raiz)
    if (dono === null) {
      porRaiz.set(raiz, null)
      continue
    }
    if (atual === undefined) porRaiz.set(raiz, dono)
    else if (atual === null || atual.id !== dono.id) porRaiz.set(raiz, null)
  }

  const linhas = (merchants.data ?? []) as {
    id: string
    cnpj: string | null
    corporate_name: string | null
  }[]

  const out: Record<string, DonoDeduzido> = {}

  // Passo 1 e 2 — pistas do próprio merchant.
  for (const m of linhas) {
    const cnpj = soDigitos(m.cnpj)
    if (cnpj.length === 14) {
      const d = porPista.get(cnpj)
      if (d) {
        out[m.id] = { ...d, via: "cnpj" }
        continue
      }
    }
    const raiz =
      cnpj.length >= 8 ? cnpj.slice(0, 8) : raizNaRazaoSocial(m.corporate_name)
    if (raiz) {
      const d = porRaiz.get(raiz)
      if (d) out[m.id] = { ...d, via: "raiz" }
    }
  }

  // Passo 3 — razão social, apoiada só no que os passos anteriores acharam.
  const porRazao = new Map<string, { id: string; name: string } | null>()
  for (const m of linhas) {
    const razao = (m.corporate_name ?? "").trim().toUpperCase()
    const d = out[m.id]
    if (!razao || !d) continue
    const atual = porRazao.get(razao)
    if (atual === undefined) porRazao.set(razao, { id: d.id, name: d.name })
    else if (atual === null || atual.id !== d.id) porRazao.set(razao, null)
  }
  for (const m of linhas) {
    if (out[m.id]) continue
    const razao = (m.corporate_name ?? "").trim().toUpperCase()
    if (!razao) continue
    const d = porRazao.get(razao)
    if (d) out[m.id] = { ...d, via: "razao" }
  }

  return out
}
