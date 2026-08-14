"use client"

import { AlertTriangle, Unplug } from "lucide-react"

import type { MerchantSumido } from "@/lib/ifood/merchants-sumidos"

/**
 * "Estas lojas sumiram da API do iFood."
 *
 * Revogação não avisa: o merchant some da resposta e pronto — sem erro, sem
 * evento, sem status. Uma loja CONECTADA que é revogada continua com
 * `api_store_id` preenchido e simplesmente para de trazer dado; o cliente só
 * descobre quando estranha o faturamento parado, semanas depois.
 *
 * As conectadas vêm primeiro e em vermelho porque são as que estão perdendo
 * dado AGORA. As que ainda não tinham vínculo entram em âmbar: ali o efeito é
 * só a conexão não fechar, o que já aparece na lista de solicitações.
 */
export function RevogadasAviso({ sumidos }: { sumidos: MerchantSumido[] }) {
  if (sumidos.length === 0) return null
  const conectadas = sumidos.filter((m) => m.loja)
  const soltas = sumidos.filter((m) => !m.loja)

  return (
    <div className="flex flex-col gap-2">
      {conectadas.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
          <div className="flex items-center gap-2">
            <Unplug className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              {conectadas.length === 1
                ? "1 loja conectada foi revogada no iFood"
                : `${conectadas.length} lojas conectadas foram revogadas no iFood`}
            </p>
          </div>
          <p className="mt-1 pl-6 text-xs text-rose-800 dark:text-rose-300">
            Elas continuam marcadas como conectadas aqui, mas o iFood parou de
            devolvê-las — então <b>não entra mais dado nenhum</b>. O lojista
            precisa autorizar o Delivery OS de novo no Portal do Parceiro.
          </p>
          <ul className="mt-2 space-y-1 pl-6">
            {conectadas.map((m) => (
              <li
                key={m.merchantId}
                className="text-xs text-rose-900 dark:text-rose-200"
              >
                <b>
                  #{m.loja!.code} {m.loja!.name}
                </b>{" "}
                <span className="opacity-70">
                  · {m.loja!.empresa} · sem aparecer desde{" "}
                  {new Date(m.desde).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {soltas.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {soltas.length === 1
                ? "1 loja apareceu e sumiu da lista do iFood"
                : `${soltas.length} lojas apareceram e sumiram da lista do iFood`}
            </p>
          </div>
          {/* O que sabemos é só que o iFood parou de devolver a loja. Dizer
              "o lojista revogou" é palpite, e em 13/ago/26 esse palpite estava
              errado: as lojas da Tech Assessoria seguiam "Ativo" no portal e a
              API respondia 403 — virou chamado com o iFood. Afirmar culpa do
              cliente manda cobrar dele uma coisa que ele já fez. */}
          <p className="mt-1 pl-6 text-xs text-amber-800 dark:text-amber-300">
            O iFood parou de devolver estas lojas. Confira o CNPJ na aba
            Permissões do Portal do Parceiro: <b>&quot;Aguardando Ativação&quot;</b> =
            o lojista precisa aprovar de novo; <b>&quot;Ativo&quot;</b> = está aprovado
            e o iFood não está entregando — aí é problema deles.
          </p>
          <ul className="mt-2 space-y-1 pl-6">
            {soltas.map((m) => (
              <li
                key={m.merchantId}
                className="text-xs text-amber-900 dark:text-amber-200"
              >
                <b>{m.nome ?? m.merchantId}</b>
                {m.cnpj ? (
                  <span className="opacity-70"> · CNPJ {m.cnpj}</span>
                ) : null}
                <span className="opacity-70">
                  {" "}
                  · desde{" "}
                  {new Date(m.desde).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
