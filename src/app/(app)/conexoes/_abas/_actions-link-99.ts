"use server"

import { isSuperadmin } from "@/lib/auth/permissions"
import {
  gerarLinkAutorizacao99,
  type LinkAutorizacao99,
} from "@/lib/ninefood/link-autorizacao"

/**
 * Gera o link self-service do 99 no clique.
 *
 * Gerar na hora, e não guardar: a URL vale 7 dias, e um link guardado vence
 * calado — o cliente clica, não funciona, e vira chamado. Ver
 * `lib/ninefood/link-autorizacao.ts`.
 *
 * Superadmin apenas: a URL é do NOSSO app e serve pra qualquer conta do 99
 * autorizar. Ela não vaza dado de cliente nenhum, mas quem a distribui decide
 * quem passa a mandar dado pra dentro do sistema — isso é decisão da operação.
 */
export async function pedirLinkAutorizacao99(): Promise<LinkAutorizacao99> {
  if (!(await isSuperadmin())) {
    return { ok: false, error: "Só a operação pode gerar este link." }
  }
  return gerarLinkAutorizacao99()
}
