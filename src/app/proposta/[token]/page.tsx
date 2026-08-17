import { notFound } from "next/navigation"

import { getPropostaPorToken } from "@/lib/data/proposta-aceite"
import { DocumentoProposta } from "@/app/(app)/propostas/_components/documento-proposta"

import { PainelAceite } from "./_components/painel-aceite"

/**
 * A proposta que o CLIENTE abre — pública, sem login.
 *
 * ── POR QUE SEM LOGIN ────────────────────────────────────────────────────
 * Quem recebe a proposta ainda não é cliente: não tem conta, não tem senha, e
 * exigir cadastro pra ler um orçamento é o jeito mais rápido de não receber
 * resposta. O que protege a página é o token do link — 24 bytes aleatórios,
 * um por proposta.
 *
 * ⚠️ `noindex` NÃO É DETALHE. A página tem CNPJ, endereço e preço negociado de
 * um cliente. Sem isto, o primeiro link compartilhado em grupo de WhatsApp com
 * prévia acaba no índice do Google.
 */
export const metadata = {
  title: "Proposta comercial — Delivery OS",
  robots: { index: false, follow: false },
}

// O aceite muda o que a página mostra: nada de cache entre a resposta do
// cliente e a tela que ele vê logo depois.
export const dynamic = "force-dynamic"

export default async function PropostaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const p = await getPropostaPorToken(token)

  // Token errado, proposta em rascunho ou cancelada caem todos aqui, e de
  // propósito com a MESMA cara: um "esta proposta foi cancelada" contaria a
  // quem adivinhou um token que ele acertou o palpite.
  if (!p) notFound()

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      <header
        data-print="hide"
        className="border-b border-zinc-200 bg-white px-5 py-3"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[#ff4d1c] text-[13px] font-black text-white">
              D
            </div>
            <span className="text-sm font-extrabold tracking-tight text-zinc-900">
              Delivery<span className="text-[#ff4d1c]">OS</span>
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-zinc-500">
            nº {p.numero}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:p-0">
        <div className="rounded-lg bg-white shadow-sm print:rounded-none print:shadow-none">
          <DocumentoProposta
            numero={p.numero}
            d={p.dados}
            modelo={p.modelo}
            aceite={p.aceite}
          />
        </div>

        <PainelAceite
          token={token}
          status={p.status}
          aceite={p.aceite}
          razaoSocial={p.dados.razaoSocial}
        />
      </main>
    </div>
  )
}
