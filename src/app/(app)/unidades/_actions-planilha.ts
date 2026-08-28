"use server"

/**
 * Importação de unidades em massa e upload de logos em lote.
 *
 * ── DUAS ETAPAS, E A SEGUNDA NÃO CONFIA NA PRIMEIRA ──────────────────────
 * `previaDaPlanilha` lê e classifica; `importarPlanilha` grava. As duas
 * recebem O ARQUIVO, não o resultado da prévia — de propósito.
 *
 * Devolver as linhas validadas pro navegador e aceitá-las de volta na hora de
 * gravar seria confiar no cliente pra dizer o que entra no banco: bastaria
 * editar o payload pra escrever em loja de outra empresa. Reler o arquivo
 * custa um parse a mais e fecha a porta.
 */
import { revalidatePath, revalidateTag } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { requireModulePermission } from "@/lib/auth/guards"
import { getDefaultBrand } from "@/lib/data/units"
import { validateImageUpload } from "@/lib/upload/image"
import {
  lerPlanilhaUnidades,
  type PreviaImportacao,
} from "@/lib/unidades/planilha-leitura"
import { COLUNAS } from "@/lib/unidades/planilha-colunas"

export type ResultadoImportacao = {
  ok: boolean
  message?: string
  criadas?: number
  atualizadas?: number
  /** Linhas que o banco recusou mesmo tendo passado na validação. */
  falhas?: { linha: number; code: string; erro: string }[]
}

/** Lê a planilha e devolve o que ela FARIA. Não grava nada. */
export async function previaDaPlanilha(
  formData: FormData,
): Promise<PreviaImportacao> {
  await requireModulePermission("unidades", "edit")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { linhas: [], criar: 0, atualizar: 0, erros: 0, fatais: ["Selecione um arquivo."] }
  }
  return lerPlanilhaUnidades(arquivo)
}

/**
 * Grava. Linha com erro é PULADA, não derruba o lote.
 *
 * A alternativa — abortar tudo se uma linha estiver errada — parece mais
 * segura e não é: numa planilha de 300 lojas sempre tem um CEP torto, e exigir
 * o arquivo perfeito faz a pessoa desistir ou, pior, apagar a linha problemática
 * só pra passar. Melhor gravar as 299 e dizer com todas as letras qual ficou
 * de fora e por quê.
 */
export async function importarPlanilha(
  formData: FormData,
): Promise<ResultadoImportacao> {
  try {
    await requireModulePermission("unidades", "edit")
    const arquivo = formData.get("arquivo")
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return { ok: false, message: "Selecione um arquivo." }
    }

    const previa = await lerPlanilhaUnidades(arquivo)
    if (previa.fatais.length > 0) {
      return { ok: false, message: previa.fatais.join(" ") }
    }

    const supabase = createAdminClient()
    const allowed = await getAccessibleUnitIds()
    const permitido = allowed === null ? null : new Set(allowed)
    const brand = await getDefaultBrand()

    let criadas = 0
    let atualizadas = 0
    const falhas: { linha: number; code: string; erro: string }[] = []

    for (const l of previa.linhas) {
      if (l.acao === "erro" || !l.dados) continue

      const { platforms, idsPlataforma, ...campos } = l.dados
      // Cidade pela lista do IBGE, igual ao formulário — senão a planilha
      // viraria a porta dos fundos por onde "SAO PAULO" volta pra base.
      const { data: cidadeOk } = await supabase.rpc("normalizar_cidade", {
        p_cidade: String(campos.city ?? ""),
        p_uf: String(campos.state ?? ""),
      })
      const registro = { ...campos, city: (cidadeOk as string | null) ?? campos.city }

      try {
        if (l.acao === "atualizar" && l.unitId) {
          // ⚠️ Segunda checagem de escopo. A primeira foi na leitura; esta
          // vale porque é aqui que a escrita acontece, e escrita em loja de
          // outra empresa é o erro que não dá pra desfazer.
          if (permitido && !permitido.has(l.unitId)) {
            falhas.push({ linha: l.linha, code: l.code, erro: "Loja fora do seu acesso" })
            continue
          }
          const { error } = await supabase
            .from("units")
            .update(registro)
            .eq("id", l.unitId)
          if (error) throw new Error(error.message)
          await sincronizarPlataformas(
            supabase,
            l.unitId,
            platforms,
            idsPlataforma,
          )
          atualizadas++
        } else {
          const { data: nova, error } = await supabase
            .from("units")
            .insert({ ...registro, brand_id: brand.id })
            .select("id")
            .single()
          if (error) throw new Error(error.message)
          await sincronizarPlataformas(
            supabase,
            String(nova.id),
            platforms,
            idsPlataforma,
          )
          criadas++
        }
      } catch (e) {
        falhas.push({
          linha: l.linha,
          code: l.code,
          erro: e instanceof Error ? e.message : String(e),
        })
      }
    }

    revalidateTag("units", "max")
    revalidatePath("/unidades")
    revalidatePath("/inicio")

    return { ok: true, criadas, atualizadas, falhas }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/**
 * Deixa `unit_platforms` igual ao que a planilha pediu.
 *
 * Desativa em vez de apagar: a linha carrega o `api_store_id` e a data em que
 * a plataforma foi habilitada. Apagar e recriar perderia o vínculo com o iFood
 * e a loja voltaria pra fila de vínculo manual — um efeito colateral e tanto
 * pra quem só queria corrigir um telefone na planilha.
 *
 * O `external_store_id` entra aqui desde 28/08/26. Antes esta função escrevia
 * só `{unit_id, platform, active}`, e o resultado é que a criação em lote
 * produzia cadastro completo e loja irreconhecível: as 16 da Churrasco Royal
 * entraram em 19/08 e o 99 não tinha como casar nenhuma delas. A regra existia
 * no formulário de edição; a cópia do lado — o importador — nunca recebeu.
 */
async function sincronizarPlataformas(
  supabase: ReturnType<typeof createAdminClient>,
  unitId: string,
  desejadas: string[],
  ids: Partial<Record<string, string>> = {},
): Promise<void> {
  const { data: atuais } = await supabase
    .from("unit_platforms")
    .select("platform, active, external_store_id")
    .eq("unit_id", unitId)
  const existentes = new Map(
    ((atuais ?? []) as { platform: string; active: boolean }[]).map((p) => [
      p.platform,
      p.active,
    ]),
  )
  const idAtual = new Map(
    ((atuais ?? []) as { platform: string; external_store_id: string | null }[]).map(
      (p) => [p.platform, p.external_store_id],
    ),
  )

  for (const p of desejadas) {
    const idNovo = ids[p]
    if (existentes.has(p)) {
      // Célula vazia PRESERVA o que já existe — a planilha não é a única
      // porta pra esse campo, e quem corrige um telefone não deveria apagar
      // um vínculo sem querer. Só grava quando veio valor E ele mudou.
      const patch: Record<string, unknown> = {}
      if (!existentes.get(p)) patch.active = true
      if (idNovo && idNovo !== idAtual.get(p)) patch.external_store_id = idNovo
      if (Object.keys(patch).length > 0) {
        await supabase
          .from("unit_platforms")
          .update(patch)
          .eq("unit_id", unitId)
          .eq("platform", p)
      }
    } else {
      await supabase.from("unit_platforms").insert({
        unit_id: unitId,
        platform: p,
        active: true,
        external_store_id: idNovo ?? null,
      })
    }
  }

  for (const [p, ativa] of existentes) {
    if (ativa && !desejadas.includes(p)) {
      await supabase
        .from("unit_platforms")
        .update({ active: false })
        .eq("unit_id", unitId)
        .eq("platform", p)
    }
  }
}

export type ResultadoLogos = {
  ok: boolean
  message?: string
  enviados?: { arquivo: string; code: string }[]
  semLoja?: string[]
  recusados?: { arquivo: string; motivo: string }[]
}

/**
 * Sobe vários logos de uma vez, casando ARQUIVO ↔ LOJA pelo nome do arquivo.
 *
 * "01.png" vai pra loja de código 01. Escolhi isso em vez de uma coluna de URL
 * na planilha porque o logo mora no computador de quem cadastra, não numa URL
 * pública — pedir link obrigaria a pessoa a hospedar as imagens em algum lugar
 * antes, que é exatamente o trabalho que este recurso existe pra evitar.
 *
 * Arquivo que não casa com nenhuma loja é DEVOLVIDO na resposta, não engolido:
 * quem mandou 300 imagens precisa saber quais 4 ficaram de fora.
 */
export async function subirLogosEmMassa(
  formData: FormData,
): Promise<ResultadoLogos> {
  try {
    await requireModulePermission("unidades", "edit")
    const arquivos = formData.getAll("logos").filter((f): f is File => f instanceof File)
    if (arquivos.length === 0) return { ok: false, message: "Selecione as imagens." }

    const supabase = createAdminClient()
    const allowed = await getAccessibleUnitIds()
    let q = supabase.from("units").select("id, code")
    if (allowed !== null) {
      if (allowed.length === 0) return { ok: false, message: "Nenhuma loja no seu acesso." }
      q = q.in("id", allowed)
    }
    const { data: units } = await q
    const porCodigo = new Map(
      ((units ?? []) as { id: string; code: string }[]).map((u) => [
        u.code.trim().toLowerCase(),
        u.id,
      ]),
    )

    const enviados: { arquivo: string; code: string }[] = []
    const semLoja: string[] = []
    const recusados: { arquivo: string; motivo: string }[] = []

    for (const f of arquivos) {
      const semExtensao = f.name.replace(/\.[^.]+$/, "").trim().toLowerCase()
      const unitId = porCodigo.get(semExtensao)
      if (!unitId) {
        semLoja.push(f.name)
        continue
      }

      // Mesma validação do upload de um logo só: MAGIC BYTES, não extensão.
      // Confiar no ".png" do nome é aceitar qualquer coisa renomeada.
      const img = await validateImageUpload(f)
      if (!img.ok) {
        recusados.push({ arquivo: f.name, motivo: img.message })
        continue
      }

      const path = `units/${unitId}.${img.ext}`
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, img.bytes, { upsert: true, contentType: img.contentType })
      if (upErr) {
        recusados.push({ arquivo: f.name, motivo: upErr.message })
        continue
      }
      const { data: pub } = supabase.storage.from("branding").getPublicUrl(path)
      const { error } = await supabase
        .from("units")
        .update({ logo_url: `${pub.publicUrl}?v=${Date.now()}` })
        .eq("id", unitId)
      if (error) {
        recusados.push({ arquivo: f.name, motivo: error.message })
        continue
      }
      enviados.push({ arquivo: f.name, code: semExtensao })
    }

    revalidateTag("units", "max")
    revalidatePath("/unidades")

    return { ok: true, enviados, semLoja, recusados }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

/** Títulos das colunas, pro texto de ajuda da tela não repetir a lista. */
export async function titulosDasColunas(): Promise<string[]> {
  return COLUNAS.map((c) => c.titulo)
}
