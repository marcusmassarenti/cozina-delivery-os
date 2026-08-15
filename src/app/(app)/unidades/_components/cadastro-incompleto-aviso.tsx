"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"

import { useMarcaNavegador } from "@/components/shared/use-marca-navegador"
import type { CadastroIncompleto } from "@/lib/data/cadastro-incompleto"

/**
 * Faixa de "faltam dados no cadastro".
 *
 * POR QUE EXISTE: desde 09/08/26 os campos do cadastro são obrigatórios
 * também na EDIÇÃO. Sem aviso, a pessoa só descobre ao abrir uma loja pra
 * trocar o telefone e levar um formulário de 13 campos na cara — no meio de
 * outra tarefa, que é o pior momento possível.
 *
 * DOIS COMPORTAMENTOS, de propósito:
 *  • Na tela inicial ela é DISPENSÁVEL (tem o X). Ali a pessoa veio ver o
 *    faturamento do dia; prender um aviso de cadastro no caminho dela seria
 *    sequestrar a tela por uma tarefa que não é a dela agora.
 *  • Em Unidades ela é PERMANENTE, sem X. Ali a pessoa está exatamente onde
 *    se resolve o problema, e um aviso que se fecha é um aviso que some pra
 *    sempre — some justamente de quem tinha como agir.
 *
 * O "fechar" da inicial vale só pela sessão, e a chave inclui a contagem: se
 * o número mudar (alguém completou uma loja, ou entrou loja nova incompleta),
 * a faixa volta. Esconder o retrato novo por causa de um "fechar" antigo
 * seria esconder justamente a mudança.
 */
export function CadastroIncompletoAviso({
  dados,
  permanente = false,
}: {
  dados: CadastroIncompleto
  permanente?: boolean
}) {
  const chave = `cadastro-incompleto:${dados.lojas}:${dados.campos}`
  // `noServidor: false` = enquanto não existe navegador, presume NÃO fechado e
  // mostra. Aviso de pendência erra pro lado de aparecer.
  const [fechado, fechar] = useMarcaNavegador("session", chave, {
    noServidor: false,
  })

  if (dados.lojas === 0 || (!permanente && fechado)) return null

  const nLojas =
    dados.lojas === 1 ? "1 loja precisa" : `${dados.lojas} lojas precisam`

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="flex-1 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-semibold">{nLojas} de atenção no cadastro</p>
        <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
          Faltam <strong>{dados.campos}</strong>{" "}
          {dados.campos === 1 ? "informação" : "informações"} no total. Salvar
          qualquer alteração numa loja passa a exigir o cadastro completo — os
          dados das plataformas continuam entrando normalmente.
        </p>

        {dados.piores.length > 0 && (
          <p className="mt-1.5 text-[13px] text-amber-800/80 dark:text-amber-300/80">
            Comece por{" "}
            {dados.piores.slice(0, 3).map((p, i) => (
              <React.Fragment key={p.unitId}>
                {i > 0 && ", "}
                <strong>{p.nome}</strong> ({p.faltando})
              </React.Fragment>
            ))}
            .
          </p>
        )}

        {!permanente && (
          <Link
            href="/unidades"
            className="mt-2 inline-block text-[13px] font-semibold underline underline-offset-2"
          >
            Ver as lojas
          </Link>
        )}
      </div>

      {/* Sem X em Unidades: é onde se resolve, e aviso que se fecha some de
          quem tinha como agir. */}
      {!permanente && (
        <button
          type="button"
          onClick={fechar}
          className="rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/40"
          aria-label="Fechar aviso"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
