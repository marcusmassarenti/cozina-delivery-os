import { notFound } from "next/navigation"

import { podeVerCarteira } from "@/lib/data/carteira-acesso"

/**
 * PORTÃO DA CARTEIRA.
 *
 * Esconder do menu não é travar: a URL continua digitável, e as páginas
 * pedem só `assertCanView("unidades")` — que todo cliente com o módulo tem.
 * Quem colasse o endereço entraria.
 *
 * `notFound()` e não "acesso negado": pra quem não é agência esta tela não
 * existe, e um "você não tem permissão" convidaria a pedir acesso a um
 * produto que não serve pra ele.
 */
export default async function CarteiraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await podeVerCarteira())) notFound()
  return <>{children}</>
}
