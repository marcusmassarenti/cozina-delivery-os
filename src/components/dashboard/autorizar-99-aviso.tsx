"use client"

import { AlertCircle } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import type { MinhaSolicitacao99 } from "@/lib/data/minhas-solicitacoes-99"

/**
 * "Falta você autorizar no 99" — na barra de avisos da tela de Início.
 *
 * ── POR QUE (Marcus, 19/08/26) ───────────────────────────────────────────
 * O 99 só devolve a loja depois que o lojista autoriza o Delivery OS no portal
 * dele. Enquanto isso não acontece não existe nada a fazer do nosso lado, e do
 * lado dele não havia nenhum sinal de que faltava algo — a loja ficava parada
 * com os dois achando que a bola era do outro. O e-mail sozinho não resolve:
 * some na caixa de entrada. Aqui está no caminho de quem abre o sistema.
 *
 * ⚠️ SEM BOTÃO DE FECHAR, de propósito. Diferente do "sua loja conectou", que é
 * notícia, este é PENDÊNCIA: some quando a autorização chega, não quando a
 * pessoa cansa de ver.
 */
export function Autorizar99Aviso({
  itens,
}: {
  itens: MinhaSolicitacao99[]
}) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-2">
      {itens.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-600/10">
            <AlertCircle className="size-4 text-amber-700 dark:text-amber-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              <span>Falta autorizar</span>
              <PlatformLogo platform="99food" size="sm" />
              <span>
                o 99 Food
                {s.unitName ? (
                  <>
                    {" "}
                    — <b>{s.unitCode} · {s.unitName}</b>
                  </>
                ) : null}
              </span>
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Já pedimos a conexão ao 99. O último passo é seu: entre no portal
              do 99 com o usuário <b>dono da loja</b> e autorize o aplicativo{" "}
              <b>Delivery OS</b> para esta loja. É uma autorização por loja —
              autorizar numa não vale para as outras. Assim que sair, o
              faturamento passa a entrar sozinho.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
