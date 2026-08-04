/**
 * GET /api/ver-como/sair — encerra a visão somente-leitura de um cliente.
 *
 * É GET por dois motivos. Primeiro, prático: a trava do middleware recusa
 * qualquer POST enquanto o cookie existir, então a saída não pode ser um POST
 * — ficaria presa atrás da própria trava. Segundo, de segurança: sair é
 * DESESCALAR privilégio. Mesmo que alguém consiga fazer o navegador do
 * suporte abrir este endereço, o pior que acontece é ele voltar a ser ele
 * mesmo.
 *
 * Não pede permissão nenhuma de propósito: apagar o próprio cookie é sempre
 * seguro, e exigir sessão válida aqui só criaria um jeito de ficar preso na
 * visão caso a sessão expirasse.
 */
import { NextResponse } from "next/server"

import { COOKIE_VER_COMO } from "@/lib/auth/ver-como"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const destino = new URL("/clientes", new URL(req.url).origin)
  const res = NextResponse.redirect(destino, 302)
  // `delete` com o mesmo path com que foi criado — senão o navegador mantém o
  // cookie antigo e a pessoa continua presa na visão sem entender por quê.
  res.cookies.set(COOKIE_VER_COMO, "", { path: "/", maxAge: 0 })
  return res
}
