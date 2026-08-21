/**
 * Trava de execução única pras sincronizações pesadas.
 *
 * O botão "Sincronizar iFood (todos)" percorre a base inteira e escreve numa
 * tabela de quase 2 milhões de linhas. Uma execução já pesa; DUAS ao mesmo
 * tempo saturam o disco do banco e todo o resto entra na fila — login
 * incluído.
 *
 * E duas ao mesmo tempo é o caso COMUM, não o raro: no celular a requisição
 * estoura o tempo do navegador ("Load failed") enquanto o servidor segue
 * trabalhando. Quem vê o erro clica de novo — e agora são duas.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Depois disso a trava é considerada abandonada (processo morreu no meio). */
const VALIDADE_MIN = 15

export type Trava = { pegou: true; liberar: () => Promise<void> } | {
  pegou: false
  /** Há quantos minutos a outra execução começou. */
  desdeMin: number
  origem: string | null
}

export async function pegarTrava(
  nome: string,
  origem: string,
): Promise<Trava> {
  const admin = createAdminClient()

  const { error } = await admin
    .from("sync_locks")
    .insert({ nome, origem, iniciado_em: new Date().toISOString() })

  if (!error) return { pegou: true, liberar: () => liberar(nome) }

  // 23505 = já existe. Qualquer outro erro NÃO pode barrar o trabalho: trava
  // que falha e impede o sync é pior que sync duplicado.
  if (error.code !== "23505") return { pegou: true, liberar: () => liberar(nome) }

  const { data } = await admin
    .from("sync_locks")
    .select("iniciado_em, origem")
    .eq("nome", nome)
    .maybeSingle()

  const inicio = (data as { iniciado_em?: string } | null)?.iniciado_em
  const desdeMin = inicio
    ? Math.round((Date.now() - new Date(inicio).getTime()) / 60000)
    : 0

  // Trava velha = processo que morreu sem liberar. Assume e segue.
  if (!inicio || desdeMin >= VALIDADE_MIN) {
    await admin
      .from("sync_locks")
      .update({ iniciado_em: new Date().toISOString(), origem })
      .eq("nome", nome)
    return { pegou: true, liberar: () => liberar(nome) }
  }

  return {
    pegou: false,
    desdeMin,
    origem: (data as { origem?: string | null } | null)?.origem ?? null,
  }
}

async function liberar(nome: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("sync_locks").delete().eq("nome", nome)
  } catch {
    // Trava órfã se resolve sozinha pela validade — nunca vale derrubar o
    // resultado do sync por causa da limpeza.
  }
}
