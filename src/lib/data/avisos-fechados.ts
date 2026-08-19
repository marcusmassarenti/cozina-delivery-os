import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Avisos que a pessoa já fechou — do SERVIDOR, não do navegador.
 *
 * O X morava em `localStorage`, que é por navegador E por origem: fechar no
 * Chrome do desktop não fechava no Safari do celular, sumia ao limpar dados e
 * não existia em aba anônima. O comentário do próprio componente já admitia o
 * buraco ("a DG FOODS chegou a ter 47 avisos voltando a cada aparelho novo") e
 * em 19/08/26 ele apareceu inteiro: o Marcus fechava o aviso da Brooklin e ele
 * voltava toda vez.
 *
 * A chave é livre ("conexao-nova|99food|<unit_id>") pra servir qualquer aviso
 * sem precisar de tabela nova.
 */
export async function getAvisosFechados(): Promise<Set<string>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Set()

  const { data, error } = await supabase
    .from("avisos_fechados")
    .select("chave")
    .eq("user_id", user.id)
  if (error) {
    // Falhou a leitura? Mostra o aviso. Esconder por engano é pior: o aviso
    // existe justamente pra dizer que a loja conectou.
    console.error("getAvisosFechados:", error.message)
    return new Set()
  }
  return new Set(((data ?? []) as { chave: string }[]).map((r) => r.chave))
}
