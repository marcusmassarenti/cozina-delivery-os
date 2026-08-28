import { notFound } from "next/navigation"

import { isSuperadmin } from "@/lib/auth/permissions"

/**
 * PORTÃO DA CARTEIRA — travada até o Marcus liberar (28/08/26).
 *
 * O menu já esconde os itens com `superadminOnly`, mas esconder do menu não é
 * travar: a URL continua digitável, e /carteira/lojas só pedia
 * `assertCanView("unidades")` — que todo cliente com o módulo tem. Quem
 * colasse o endereço entraria.
 *
 * `notFound()` e não "acesso negado" de propósito: a tela ainda não existe
 * pro cliente, e um "você não tem permissão" convidaria a pedir permissão pra
 * uma coisa que ainda é rascunho.
 *
 * PRA LIBERAR: apagar este arquivo e tirar `superadminOnly` dos quatro itens
 * em lib/nav.ts. As duas coisas juntas — só uma delas deixa o buraco.
 */
export default async function CarteiraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await isSuperadmin())) notFound()
  return <>{children}</>
}
