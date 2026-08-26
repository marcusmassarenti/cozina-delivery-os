"use client"

import * as React from "react"
import { PartyPopper, Star, X } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fecharAviso } from "@/app/(app)/_actions-avisos"
import type {
  ConexaoNova,
  PrimeiraAvaliacao,
} from "@/lib/data/conexoes-novas"

const ROTULO = {
  ifood: "iFood",
  "99food": "99 Food",
  cardapioweb: "Cardápio Web",
} as const

/**
 * "Sua loja foi conectada!" para 99 Food e Cardápio Web.
 *
 * ── POR QUE (Marcus, 18/08/26): "o cliente fica perdido" ─────────────────
 * O iFood comemorava a conexão e as outras duas não diziam nada. Quem conecta
 * o Cardápio Web vê a tela igual à de antes e não sabe se funcionou — e o
 * silêncio no meio de um onboarding é o que faz a pessoa desistir ou abrir
 * chamado.
 *
 * A mensagem muda conforme o dado JÁ ter chegado: "conectada" quando ainda
 * está trazendo, "já trazendo dado" quando chegou. Dizer "pronto!" com a tela
 * ainda vazia seria prometer o que a pessoa não vê.
 */
export function ConexaoNovaAviso({
  conexoes,
  fechados: fechadosDoServidor = [],
}: {
  conexoes: ConexaoNova[]
  /** Chaves já fechadas por esta pessoa, vindas do banco. */
  fechados?: string[]
}) {
  /**
   * Fechar é COMPLEMENTO do prazo de 7 dias, não substituto.
   *
   * ⚠️ O X JÁ MOROU NO localStorage E NÃO FUNCIONAVA. localStorage é por
   * navegador E por origem: fechar no desktop não fechava no celular, sumia ao
   * limpar dados e não existia em aba anônima. A DG FOODS chegou a ter 47
   * avisos voltando a cada aparelho novo, e em 19/08/26 o Marcus fechou o aviso
   * da Brooklin e ele voltou toda vez. Agora o fechamento vai pro banco, por
   * usuário — vale em qualquer lugar em que ele entrar.
   *
   * O estado local existe só pra sumir na hora do clique, sem esperar a
   * ida ao servidor.
   */
  const [fechadosAgora, setFechadosAgora] = React.useState<string[]>([])

  function fechar(chave: string) {
    setFechadosAgora((atual) => [...atual, chave])
    // Sem await: se falhar, o aviso volta no próximo carregamento — que é o
    // lado certo de errar num aviso de "sua loja conectou".
    void fecharAviso(`conexao-nova|${chave}`)
  }

  const visiveis = conexoes.filter((c) => {
    const chave = `${c.plataforma}|${c.unitId}`
    return (
      !fechadosAgora.includes(chave) &&
      !fechadosDoServidor.includes(`conexao-nova|${chave}`)
    )
  })
  if (visiveis.length === 0) return null

  /**
   * UM CARD POR LOJA, não por plataforma.
   *
   * ── POR QUE (Marcus, 22/08/26) ─────────────────────────────────────────
   * A CR Poços conectou no iFood, no 99 e no Cardápio Web e a home mostrou
   * três cards seguidos, com a mesma frase e o mesmo nome de loja, mudando só
   * o logo. Ninguém pensa "minha loja no 99" — pensa "minha loja". Agrupado, a
   * notícia é a loja e as plataformas viram o detalhe dela.
   */
  const porLoja = new Map<string, typeof visiveis>()
  for (const c of visiveis) {
    const atual = porLoja.get(c.unitId) ?? []
    atual.push(c)
    porLoja.set(c.unitId, atual)
  }

  return (
    <div className="space-y-2">
      {[...porLoja.values()].map((grupo) => {
        const c = grupo[0]
        const todasComDado = grupo.every((g) => g.temDado)
        return (
          <div
            key={c.unitId}
            className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
              <PartyPopper className="size-4 text-emerald-700 dark:text-emerald-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                <span>
                  Sua loja <b>{c.unitCode} · {c.unitName}</b> foi conectada
                  {grupo.length > 1 ? " a" : " ao"}
                </span>
                {grupo.map((g, i) => (
                  <span
                    key={g.plataforma}
                    className="inline-flex items-center gap-1.5"
                  >
                    <PlatformLogo platform={g.plataforma} size="sm" />
                    <span>
                      {ROTULO[g.plataforma]}
                      {i < grupo.length - 2
                        ? ","
                        : i === grupo.length - 2
                          ? " e"
                          : "! 🎉"}
                    </span>
                  </span>
                ))}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {todasComDado ? (
                  <>
                    Faturamento e pedidos <b>já estão entrando sozinhos</b> pela
                    API — sem planilha.
                  </>
                ) : (
                  <>
                    Estamos trazendo o histórico agora. Os números aparecem aqui
                    assim que a primeira carga terminar — não precisa fazer nada.
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // Fecha a loja inteira: dispensar plataforma por plataforma
                // seria devolver os três cliques que o agrupamento tirou.
                for (const g of grupo) fechar(`${g.plataforma}|${g.unitId}`)
              }}
              aria-label="Fechar aviso"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-600/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Primeira carga de avaliações.
 *
 * ⚠️ SEPARADO DO AVISO DE CONEXÃO DE PROPÓSITO. A barra de cobertura fala de
 * faturamento; quando ela diz "iFood até 18/ago", o cliente lê "veio tudo" — e
 * avaliação é outra rotina, com outro horário (cron às 7h). Sem dizer isso, a
 * tela de avaliações vazia parece defeito, e é o tipo de silêncio que gera
 * chamado no primeiro dia (Marcus, 18/08/26).
 *
 * A mensagem muda conforme já ter chegado: enquanto está zerada explica QUANDO
 * chega; depois confirma o que entrou e que dali em diante é sozinho.
 */
export function PrimeiraAvaliacaoAviso({
  itens,
  fechados: fechadosDoServidor = [],
}: {
  itens: PrimeiraAvaliacao[]
  fechados?: string[]
}) {
  const [fechadosAgora, setFechadosAgora] = React.useState<string[]>([])

  if (itens.length === 0) return null

  const chegaram = itens.filter((a) => a.quantas > 0)
  const aCaminho = itens.filter((a) => a.quantas <= 0)
  const total = chegaram.reduce((s, a) => s + a.quantas, 0)

  /**
   * TRÊS OU MAIS VIRAM UM CARD SÓ.
   *
   * ── POR QUE (Marcus, 22/08/26) ─────────────────────────────────────────
   * O Churrasco Royal conectou sete lojas de uma vez e o Início virou uma
   * pilha: um card por loja, seis seguidos, dizendo quase a mesma frase. A
   * conexão já tinha essa regra (ver VariasAtivasCard em ifood-cliente-aviso)
   * e a avaliação não — então o aviso que existe pra tranquilizar acabava
   * enterrando o resto da tela.
   *
   * O corte é o mesmo de lá, pelo mesmo motivo: com uma ou duas lojas o NOME é
   * a informação que a pessoa espera ver; a partir de três ele vira lista, e o
   * que importa passa a ser o número e o "não precisa fazer nada".
   *
   * A chave inclui a contagem: conectou mais uma, o aviso volta com o número
   * novo — quem fechou com seis fica sabendo da sétima.
   */
  if (itens.length >= 3) {
    const chave = `primeira-avaliacao-lote|${itens.length}`
    if (
      fechadosAgora.includes(chave) ||
      fechadosDoServidor.includes(`conexao-nova|${chave}`)
    )
      return null

    return (
      <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
          <Star className="size-4 text-amber-600 dark:text-amber-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Avaliações de <b>{itens.length} lojas</b>
            {chegaram.length > 0 && aCaminho.length === 0
              ? " já estão aqui"
              : chegaram.length === 0
                ? " a caminho"
                : ""}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {chegaram.length > 0 && (
              <>
                <b>{total}</b> avaliação{total === 1 ? "" : "ões"} importada
                {total === 1 ? "" : "s"} em {chegaram.length} loja
                {chegaram.length === 1 ? "" : "s"}.{" "}
              </>
            )}
            {aCaminho.length > 0 && (
              <>
                {aCaminho.length} ainda sem avaliação — ela vem numa rotina
                separada do faturamento, que roda <b>uma vez por dia, de
                manhã</b>. Tela vazia até lá não é problema na conexão.{" "}
              </>
            )}
            A partir de agora entram sozinhas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFechadosAgora((a) => [...a, chave])
            void fecharAviso(`conexao-nova|${chave}`)
          }}
          aria-label="Fechar aviso"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  /**
   * O X faltava AQUI, e só aqui.
   *
   * A versão em lote (3+ lojas) sempre teve, e a de conexão nova também — só o
   * aviso individual de avaliação nascia sem jeito de fechar. Marcus reparou em
   * 26/08/26, com o aviso da Churrasco no Pão - Itaim na tela.
   *
   * Some sozinho em 3 dias (DIAS_AVALIACAO), então não é aviso eterno. Mas
   * "espera três dias" não é resposta pra quem já leu e entendeu: aviso que a
   * pessoa não consegue dispensar ensina ela a ignorar a faixa inteira — e a
   * próxima, que talvez precise de ação, morre junto.
   *
   * Mesma chave da versão em lote (`conexao-nova|…`), então o fechamento vai
   * pro banco por usuário e vale em qualquer aparelho — a lição do localStorage
   * que fez a Brooklin voltar toda vez.
   */
  const visiveis = itens.filter(
    (a) =>
      !fechadosAgora.includes(`primeira-avaliacao|${a.unitId}`) &&
      !fechadosDoServidor.includes(`conexao-nova|primeira-avaliacao|${a.unitId}`),
  )
  if (visiveis.length === 0) return null

  return (
    <div className="space-y-2">
      {visiveis.map((a) => (
        <div
          key={a.unitId}
          className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
            <Star className="size-4 text-amber-600 dark:text-amber-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Avaliações de <b>{a.unitCode} · {a.unitName}</b>
              {a.quantas > 0 ? " já estão aqui" : " a caminho"}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {a.quantas > 0 ? (
                <>
                  <b>{a.quantas}</b> avaliações importadas. A partir de agora
                  entram sozinhas, uma vez por dia.
                </>
              ) : (
                <>
                  A avaliação vem numa rotina separada do faturamento, que roda{" "}
                  <b>uma vez por dia, de manhã</b>. Se a tela de avaliações
                  ainda estiver vazia, é isso — não é problema na conexão.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const chave = `primeira-avaliacao|${a.unitId}`
              setFechadosAgora((atual) => [...atual, chave])
              void fecharAviso(`conexao-nova|${chave}`)
            }}
            aria-label="Fechar aviso"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
