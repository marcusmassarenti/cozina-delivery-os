"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight, FileWarning, Info, X } from "lucide-react"

import type { CadastroIncompleto } from "@/lib/data/cadastro-incompleto"

/**
 * Aviso de "faltam dados no cadastro".
 *
 * POR QUE EXISTE: desde 09/08/26 os campos do cadastro são obrigatórios
 * também na EDIÇÃO. Sem aviso, a pessoa só descobre ao abrir uma loja pra
 * trocar o telefone e levar um formulário de 13 campos na cara — no meio de
 * outra tarefa, que é o pior momento possível.
 *
 * ⚠️ ENCOLHIDO EM 16/08/26, a pedido do Marcus: "esse aviso está poluindo o
 * dash". A versão anterior era uma caixa âmbar de quatro linhas com triângulo
 * de alerta, o total de campos faltando e as três piores lojas — no topo da
 * tela inicial, que é onde se olha faturamento do dia.
 *
 * O problema não era a informação, era o PESO. Cadastro incompleto não bloqueia
 * nada: as plataformas continuam entrando normalmente. Pintar de urgente uma
 * pendência que não é urgente é como se ensina a ignorar os avisos que
 * importam — o mesmo raciocínio que já valia pro aviso de loja sem dado.
 *
 * DOIS COMPORTAMENTOS, de propósito:
 *  • Na tela inicial é UMA LINHA clicável e dispensável (tem o X). Ali a
 *    pessoa veio ver o faturamento; o aviso só precisa dizer que existe algo a
 *    fazer e levar até lá.
 *  • Em Unidades ela é PERMANENTE, sem X, e aí sim explica a consequência —
 *    é onde a pessoa vai esbarrar na exigência ao salvar. Aviso que se fecha
 *    some justamente de quem tinha como agir.
 *
 * O "fechar" da inicial vale só pela sessão, e a chave inclui a contagem: se
 * o número mudar (alguém completou uma loja, ou entrou loja nova incompleta),
 * a linha volta. Esconder o retrato novo por causa de um "fechar" antigo
 * seria esconder justamente a mudança.
 *
 * ⚠️ ENGOLIU O `AvisoSemCnpj` EM 16/08/26 (Marcus: "esses 2 avisos não
 * repetem?"). Repetiam: o CNPJ é UM dos 13 campos que este aviso já conta, e
 * os dois ficavam empilhados dizendo a mesma pendência com números que nem
 * batiam — 11 lojas incompletas contra "12 sem CNPJ", porque aquele contava
 * também as 3 lojas FECHADAS. Loja fechada não sincroniza, então o CNPJ dela
 * não casa nada; agora os dois lados olham só as ativas e o subconjunto fecha.
 *
 * O CNPJ continua em destaque porque é o único campo com consequência
 * automática: é a chave que casa a loja do iFood com a daqui sozinha. Sem
 * ele, loja nova precisa ser vinculada na mão (aconteceu em 29/07 com a
 * Edmai's e a Forno Itália, da DG Foods). Vira sub-linha, não faixa própria.
 */
export function CadastroIncompletoAviso({
  dados,
  permanente = false,
  semCnpj = 0,
}: {
  dados: CadastroIncompleto
  permanente?: boolean
  /** Quantas unidades ATIVAS estão sem CNPJ — subconjunto das incompletas. */
  semCnpj?: number
}) {
  const [fechado, setFechado] = React.useState(false)
  const chave = `cadastro-incompleto:${dados.lojas}:${dados.campos}`

  React.useEffect(() => {
    if (permanente || dados.lojas === 0) return
    if (sessionStorage.getItem(chave)) setFechado(true)
  }, [chave, permanente, dados.lojas])

  if (dados.lojas === 0 || (!permanente && fechado)) return null

  const texto =
    dados.lojas === 1
      ? "Atualize os dados de 1 unidade"
      : `Atualize os dados de ${dados.lojas} unidades`

  // Uma loja só? Vai direto pra ela — a lista intermediária não decide nada.
  const destino =
    dados.lojas === 1 && dados.piores[0]
      ? `/unidades/${dados.piores[0].codigo}`
      : "/unidades"

  if (!permanente) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 pr-1">
        <Link
          href={destino}
          className="group flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-4 shrink-0" />
          <span>{texto}</span>
          <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(chave, "1")
            setFechado(true)
          }}
          className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fechar aviso"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{texto}</span> — faltam{" "}
          {dados.campos} {dados.campos === 1 ? "informação" : "informações"}.
          Salvar alterações numa loja passa a exigir o cadastro completo; os
          dados das plataformas continuam entrando normalmente.
        </p>

        {semCnpj > 0 && (
          <p className="mt-1 text-[13px]">
            <strong className="font-medium text-foreground">
              {semCnpj} {semCnpj === 1 ? "está sem CNPJ" : "estão sem CNPJ"}
            </strong>
            , que é a chave pra loja do iFood casar sozinha com a daqui. As
            lojas com pendência estão marcadas com{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 align-middle dark:bg-amber-950/40 dark:text-amber-300">
              <FileWarning className="size-3" />
              Cadastro
            </span>{" "}
            na lista abaixo.
          </p>
        )}
      </div>
    </div>
  )
}
