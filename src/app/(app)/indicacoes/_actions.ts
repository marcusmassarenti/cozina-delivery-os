"use server"

import { revalidatePath } from "next/cache"

import { requireSuperadmin } from "@/lib/auth/guards"
import { auditar } from "@/lib/data/auditoria"
import { normalizarCodigo } from "@/lib/data/indicacoes"
import { createAdminClient } from "@/lib/supabase/admin"

export type IndicacaoState = { ok: boolean; message?: string }

export async function salvarIndicador(
  _prev: IndicacaoState,
  formData: FormData,
): Promise<IndicacaoState> {
  try {
    await requireSuperadmin()
    const admin = createAdminClient()

    const id = String(formData.get("id") ?? "").trim()
    const nome = String(formData.get("nome") ?? "").trim()
    const codigo = normalizarCodigo(String(formData.get("codigo") ?? ""))
    if (!nome || !codigo) return { ok: false, message: "Nome e código são obrigatórios." }
    if (codigo.length < 3) return { ok: false, message: "Código muito curto." }

    const padrinhoId = String(formData.get("padrinho") ?? "").trim() || null
    /**
     * ⚠️ NINGUÉM É PADRINHO DE SI MESMO. Sem esta trava, a apuração criaria
     * duas comissões pro mesmo indicador no mesmo cliente — uma direta e uma
     * "indireta" vinda dele próprio.
     */
    if (padrinhoId && id && padrinhoId === id) {
      return { ok: false, message: "Um indicador não pode ser padrinho de si mesmo." }
    }

    const dados = {
      nome,
      codigo,
      pix_chave: String(formData.get("pix") ?? "").trim() || null,
      contato: String(formData.get("contato") ?? "").trim() || null,
      comissao_pct: Number(String(formData.get("comissao") ?? "20").replace(",", ".")) || 0,
      desconto_pct: Number(String(formData.get("desconto") ?? "50").replace(",", ".")) || 0,
      ativo: String(formData.get("ativo") ?? "") === "on",
      nota: String(formData.get("nota") ?? "").trim() || null,
      // Quem trouxe ESTE indicador. Sem padrinho, a fatia vai a zero junto —
      // senão sobraria um percentual órfão esperando alguém ser escolhido.
      padrinho_id: padrinhoId,
      padrinho_pct: padrinhoId
        ? Number(String(formData.get("padrinhoPct") ?? "0").replace(",", ".")) || 0
        : 0,
    }

    const { error } = id
      ? await admin.from("indicadores").update(dados).eq("id", id)
      : await admin.from("indicadores").insert(dados)

    if (error) {
      // 23505 = código já usado por outro indicador.
      return {
        ok: false,
        message:
          error.code === "23505"
            ? `O código ${codigo} já pertence a outro indicador.`
            : error.message,
      }
    }

    await auditar("indicador.alterado", null, { nome, codigo, novo: !id })
    revalidatePath("/indicacoes")
    return { ok: true, message: id ? "Indicador atualizado." : "Indicador criado." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

/** Marca comissões como pagas depois que o Pix sai. */
export async function marcarComissoesPagas(
  ids: string[],
  nota?: string,
): Promise<IndicacaoState> {
  try {
    await requireSuperadmin()
    if (!ids.length) return { ok: false, message: "Nada selecionado." }
    const admin = createAdminClient()
    const hoje = new Date().toISOString().slice(0, 10)
    const { error } = await admin
      .from("comissoes")
      .update({ status: "paga", pago_em: hoje, nota: nota ?? null })
      .in("id", ids)
    if (error) return { ok: false, message: error.message }

    await auditar("comissao.paga", null, { quantidade: ids.length, em: hoje })
    revalidatePath("/indicacoes")
    return { ok: true, message: `${ids.length} comissão(ões) marcada(s) como paga(s).` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}
