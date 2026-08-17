"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Search } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { ItemCusto, ResumoCusto } from "@/lib/data/custo-itens"

import {
  aplicarCustoEmLote,
  aplicarEmMassa,
  salvarCategoriaItem,
  salvarCustoItem,
  salvarPrecoVendaItem,
} from "../../_actions"
import { SeletorCategoria } from "./seletor-categoria"
import { BarraMassa } from "./barra-massa"

/**
 * A bancada: uma linha por item vendido, custo digitado direto nela.
 *
 * ── AS DECISÕES QUE FAZEM ISSO SER RÁPIDO ────────────────────────────────
 * • Grava ao SAIR do campo, não num botão. Quem preenche cem linhas não pode
 *   perder tudo por fechar a aba antes de salvar.
 * • Enter pula pro próximo campo vazio, não pro próximo da lista: depois de
 *   preencher a linha 3, o trabalho está na 4, não em revisitar a 1.
 * • A ordem é a receita e não muda enquanto se digita. Reordenar a lista
 *   embaixo de quem está preenchendo é a forma mais rápida de perder o lugar.
 * • Quando um custo é salvo e existem linhas parecidas sem custo, aparece a
 *   oferta de aplicar nelas — com a lista à vista. É o substituto do de-para
 *   automático, que a gente mediu e não funciona (ver migration 0212).
 */
/** Um valor digitado e a foto do que o servidor mostrava naquele instante. */
type Palpite<T = number | null> = { valor: T; base: T }

/**
 * O palpite ainda vale? Só enquanto o servidor não saiu da base em que ele foi
 * feito. Quando sai — porque confirmou o nosso, ou porque outra pessoa mudou —,
 * o palpite se descarta sozinho e a tela volta a mostrar a verdade do servidor.
 *
 * Fora do componente de propósito: aqui dentro ela seria recriada a cada render
 * e viraria dependência instável dos memos que a usam.
 */
function valeAinda<T>(p: Palpite<T> | undefined, atual: T): p is Palpite<T> {
  return p !== undefined && atual === p.base
}

export function BancadaCusto({
  unitId,
  lojaNome,
  resumo,
  categoriasPadrao = [],
}: {
  unitId: string
  lojaNome: string
  resumo: ResumoCusto
  /** A lista da rede (tela inicial). Vem antes das que só existem nesta loja. */
  categoriasPadrao?: string[]
}) {
  const router = useRouter()
  const [busca, setBusca] = React.useState("")
  const [soSemCusto, setSoSemCusto] = React.useState(false)
  const [plataforma, setPlataforma] = React.useState<string>("")
  const [categoria, setCategoria] = React.useState<string>("")
  /** Linhas marcadas para ação em massa. Guardadas por chave, não por índice:
   *  filtrar a lista não pode mudar quem está selecionado. */
  const [selecao, setSelecao] = React.useState<Set<string>>(new Set())
  const [salvando, setSalvando] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [oferta, setOferta] = React.useState<{
    custo: number
    precoBase: number
    alvos: ItemCusto[]
    /** Chaves marcadas. Começa só com as de preço parecido — ver `semelhantes`. */
    marcados: Set<string>
  } | null>(null)

  // O que foi digitado nesta sessão, antes do servidor devolver. Sem isso o
  // campo "pisca" de volta pro valor antigo entre o blur e o refresh.
  const [local, setLocal] = React.useState<Record<string, string>>({})

  /**
   * Último valor já mandado por linha.
   *
   * ⚠️ Existe porque Enter e blur disparam os dois na sequência: aperta Enter,
   * grava, o campo perde o foco e o blur tentaria gravar o mesmo valor de novo.
   * A prop `item.custo` ainda é a antiga nesse instante (o refresh não voltou),
   * então a checagem "mudou?" não pega. Um ref e não estado: mudar isso não
   * deve redesenhar a tabela no meio da digitação.
   */
  const enviado = React.useRef<Record<string, number | null>>({})

  // Os mesmos dois mecanismos, para o preço de venda. Campos separados porque
  // são gravações independentes: digitar o preço não pode arrastar o custo
  // junto (nem o contrário), senão um campo em branco apagaria o outro.
  const [localPreco, setLocalPreco] = React.useState<Record<string, string>>({})
  const enviadoPreco = React.useRef<Record<string, number | null>>({})
  const [salvandoPreco, setSalvandoPreco] = React.useState<string | null>(null)

  /**
   * O que já foi gravado mas o servidor ainda não devolveu.
   *
   * ── POR QUE ISSO EXISTE (Marcus, 17/08/26: "demora pra atualizar o valor") ─
   * Salvar dispara `router.refresh()`, que re-renderiza a página INTEIRA no
   * servidor: a RPC de itens vendidos mais os agregadores das quatro
   * plataformas. Isso leva segundos — tempo demais pra quem está digitando uma
   * coluna inteira e espera ver o resultado a cada linha.
   *
   * A saída não é acelerar o refresh, é parar de depender dele pra mostrar o
   * que a pessoa acabou de digitar. Este mapa cobre a janela entre o "gravou" e
   * o "servidor devolveu", e as colunas derivadas (desconto, lucro) são
   * recalculadas aqui com as MESMAS fórmulas do servidor — ver `itensExibidos`.
   * O refresh continua acontecendo, mas em segundo plano: ele deixou de ser o
   * que a tela espera pra responder.
   *
   * ── COMO ELE SE DESFAZ SOZINHO ───────────────────────────────────────────
   * Junto do valor guardamos o que o servidor mostrava NAQUELE instante
   * (`base`). Quando o servidor passa a mostrar outra coisa — a nossa, ou a de
   * outra pessoa —, o palpite é descartado por derivação, sem efeito nenhum.
   * Sem essa âncora o overlay viraria uma segunda fonte de verdade permanente,
   * escondendo pra sempre uma edição feita por outro usuário ou pela planilha.
   */
  const [otimista, setOtimista] = React.useState<
    Record<
      string,
      {
        custo?: Palpite
        precoVenda?: Palpite
        // Categoria entra aqui porque classificar em massa é a ação mais usada
        // da barra de seleção — trinta bebidas de uma vez. Sem ela, metade do
        // trabalho em lote continuaria esperando o servidor.
        categoria?: Palpite<string | null>
      }
    >
  >({})

  const chave = (i: ItemCusto) => `${i.platform}|${i.nomeItem}`

  // Padrão da rede primeiro, depois o que só existe aqui — sem repetir.
  const opcoesCategoria = React.useMemo(() => {
    const vistas = new Set(categoriasPadrao.map((c) => c.toLowerCase()))
    return [
      ...categoriasPadrao,
      ...resumo.categorias.filter((c) => !vistas.has(c.toLowerCase())),
    ]
  }, [categoriasPadrao, resumo.categorias])

  const plataformasComItem = React.useMemo(
    () => [...new Set(resumo.itens.map((i) => i.platform))],
    [resumo.itens],
  )

  /**
   * Os itens com o que já foi digitado por cima, e as colunas derivadas
   * refeitas na hora.
   *
   * As fórmulas são as mesmas de `getCustoItens` — se uma delas mudar lá, muda
   * aqui. Duplicação assumida: a alternativa era esperar o servidor, que é
   * exatamente o que tornava a tela lenta.
   */
  const itensExibidos = React.useMemo(() => {
    if (Object.keys(otimista).length === 0) return resumo.itens
    return resumo.itens.map((i) => {
      const o = otimista[`${i.platform}|${i.nomeItem}`]
      if (!o) return i
      const custo = valeAinda(o.custo, i.custo) ? o.custo.valor : i.custo
      const precoVenda = valeAinda(o.precoVenda, i.precoVenda)
        ? o.precoVenda.valor
        : i.precoVenda
      const categoria = valeAinda(o.categoria, i.categoria)
        ? o.categoria.valor
        : i.categoria
      const lucro = custo === null ? null : i.precoMedio - i.taxaValor - custo
      const desconto = precoVenda === null ? null : precoVenda - i.precoMedio
      return {
        ...i,
        custo,
        precoVenda,
        categoria,
        desconto,
        descontoPct:
          precoVenda === null || precoVenda <= 0
            ? null
            : (desconto as number) / precoVenda,
        lucro,
        lucroPct:
          lucro === null || i.precoMedio <= 0 ? null : lucro / i.precoMedio,
        lucroMes: lucro === null ? null : lucro * i.qtd,
      }
    })
  }, [resumo.itens, otimista])

  const visiveis = React.useMemo(() => {
    const q = normalizar(busca)
    return itensExibidos.filter((i) => {
      if (soSemCusto && i.custo !== null) return false
      if (plataforma && i.platform !== plataforma) return false
      if (categoria === "__sem__" && i.categoria) return false
      if (categoria && categoria !== "__sem__" && i.categoria !== categoria)
        return false
      if (q && !normalizar(i.nomeItem).includes(q)) return false
      return true
    })
  }, [itensExibidos, busca, soSemCusto, plataforma, categoria])

  /**
   * Grava o preço de tabela. Espelha `salvar`, sem a oferta de lote.
   *
   * ⚠️ O VALOR DIGITADO SÓ SAI DO ESTADO LOCAL DEPOIS DA RESPOSTA.
   *
   * A primeira versão limpava `localPreco[k]` no próprio onBlur. O efeito era
   * cruel: o campo voltava a ler `item.precoVenda`, que ainda é o antigo até o
   * refresh do servidor chegar, então o número sumia da tela por um instante e
   * o Marcus leu isso como "não salvou" (17/08/26) — enquanto o banco já tinha
   * gravado. Otimismo que expira antes da confirmação é pior que nenhum.
   *
   * Quem limpa é esta função, quando já tem o dado novo pra colocar no lugar.
   */
  async function salvarPreco(item: ItemCusto, texto: string) {
    const k = chave(item)
    const limpo = texto.trim().replace(/\./g, "").replace(",", ".")
    const valor = limpo === "" ? null : Number(limpo)

    const limparLocal = () =>
      setLocalPreco((p) => {
        const n = { ...p }
        delete n[k]
        return n
      })

    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setErro(`Preço inválido em "${item.nomeItem}".`)
      limparLocal()
      return
    }
    const jaEnviado =
      k in enviadoPreco.current ? enviadoPreco.current[k] : item.precoVenda
    if (valor === jaEnviado) {
      limparLocal()
      return
    }
    enviadoPreco.current[k] = valor

    // A linha inteira muda AGORA — desconto incluso. O servidor confirma depois.
    setOtimista((p) => ({
      ...p,
      [k]: { ...p[k], precoVenda: { valor, base: item.precoVenda } },
    }))
    limparLocal()

    setErro(null)
    setSalvandoPreco(k)
    const r = await salvarPrecoVendaItem({
      unitId,
      platform: item.platform,
      nomeItem: item.nomeItem,
      precoVenda: valor,
    })
    setSalvandoPreco(null)

    if (!r.ok) {
      setErro(r.erro ?? "Não deu para salvar o preço.")
      // Desfaz o otimismo: mostrar um valor que o banco recusou é pior que
      // mostrar o antigo.
      setOtimista((p) => {
        const n = { ...p }
        if (n[k]) delete n[k].precoVenda
        if (n[k] && Object.keys(n[k]).length === 0) delete n[k]
        return n
      })
      return
    }
    router.refresh()
  }

  async function salvar(item: ItemCusto, texto: string) {
    const k = chave(item)
    const limpo = texto.trim().replace(/\./g, "").replace(",", ".")
    const valor = limpo === "" ? null : Number(limpo)

    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setErro(`Custo inválido em "${item.nomeItem}".`)
      return
    }
    // Não vai ao servidor se não mudou nada — sair do campo sem digitar é o
    // gesto mais comum da tela. `enviado` cobre o intervalo em que o servidor
    // ainda não devolveu e `item.custo` está velho (Enter seguido de blur).
    const jaEnviado = k in enviado.current ? enviado.current[k] : item.custo
    if (valor === jaEnviado) return
    enviado.current[k] = valor

    // Lucro bruto e taxas mudam na hora; o refresh só confirma. Ver `otimista`.
    setOtimista((p) => ({
      ...p,
      [k]: { ...p[k], custo: { valor, base: item.custo } },
    }))
    setLocal((p) => {
      const n = { ...p }
      delete n[k]
      return n
    })

    setErro(null)
    setSalvando(k)
    const r = await salvarCustoItem({
      unitId,
      platform: item.platform,
      nomeItem: item.nomeItem,
      custo: valor,
    })
    setSalvando(null)

    if (!r.ok) {
      setErro(r.erro ?? "Não deu para salvar.")
      setOtimista((p) => {
        const n = { ...p }
        if (n[k]) delete n[k].custo
        if (n[k] && Object.keys(n[k]).length === 0) delete n[k]
        return n
      })
      return
    }

    if (valor !== null) {
      const parecidos = semelhantes(item, itensExibidos)
      if (parecidos.length > 0) {
        setOferta({
          custo: valor,
          precoBase: item.precoMedio,
          alvos: parecidos,
          // Só o que tem preço perto do original já vem marcado. "Prato
          // Galera" e "Proteína em Dobro" casam por nome e são porções
          // maiores — o custo delas NÃO é o mesmo.
          marcados: new Set(
            parecidos
              .filter((a) => precoParecido(item.precoMedio, a.precoMedio))
              .map((a) => chave(a)),
          ),
        })
      }
    }
    router.refresh()
  }

  async function aplicarLote() {
    if (!oferta) return
    const escolhidos = oferta.alvos.filter((a) => oferta.marcados.has(chave(a)))
    if (escolhidos.length === 0) {
      setOferta(null)
      return
    }
    // As linhas mudam ao fechar a oferta, não quando o servidor responder.
    const antes = otimista
    setOtimista((p) => {
      const n = { ...p }
      for (const a of escolhidos) {
        const k = chave(a)
        n[k] = { ...n[k], custo: { valor: oferta.custo, base: a.custo } }
      }
      return n
    })

    setSalvando("lote")
    const r = await aplicarCustoEmLote({
      unitId,
      custo: oferta.custo,
      alvos: escolhidos.map((a) => ({
        platform: a.platform,
        nomeItem: a.nomeItem,
      })),
    })
    setSalvando(null)
    setOferta(null)
    if (!r.ok) {
      setErro(r.erro ?? "Não deu.")
      setOtimista(antes)
      return
    }
    router.refresh()
  }

  async function aplicarMassa(input: {
    categoria?: string | null
    custo?: number | null
    custoPctPreco?: number | null
  }) {
    // Parte de `itensExibidos` e não de `resumo.itens`: aplicar em massa logo
    // depois de outra ação em massa tem que enxergar o resultado da primeira.
    const selecionados = itensExibidos.filter((i) => selecao.has(chave(i)))
    const alvos = selecionados.map((i) => ({
      platform: i.platform,
      nomeItem: i.nomeItem,
      precoMedio: i.precoMedio,
    }))
    if (alvos.length === 0) return

    // As linhas selecionadas mudam no clique. As mesmas contas do servidor:
    // custo fixo vale pra todas; "% do preço" é por linha, sobre o preço médio
    // de cada uma.
    const antes = otimista
    setOtimista((p) => {
      const n = { ...p }
      for (const i of selecionados) {
        const k = chave(i)
        const atual = { ...n[k] }
        if (input.categoria !== undefined) {
          atual.categoria = { valor: input.categoria, base: i.categoria }
        }
        if (input.custo !== undefined && input.custo !== null) {
          atual.custo = { valor: input.custo, base: i.custo }
        }
        if (input.custoPctPreco !== undefined && input.custoPctPreco !== null) {
          atual.custo = {
            valor: i.precoMedio * (input.custoPctPreco / 100),
            base: i.custo,
          }
        }
        n[k] = atual
      }
      return n
    })

    setSalvando("massa")
    setErro(null)
    const r = await aplicarEmMassa({ unitId, alvos, ...input })
    setSalvando(null)
    if (!r.ok) {
      setErro(r.erro ?? "Não deu.")
      setOtimista(antes)
      return
    }
    // A seleção some depois de aplicar: manter marcado convida a aplicar duas
    // vezes sem perceber, e a segunda sobrescreve a primeira em silêncio.
    setSelecao(new Set())
    // O que foi gravado em massa passa a ser o valor de referência — senão o
    // blur de uma linha ainda em foco regravaria o valor antigo.
    enviado.current = {}
    router.refresh()
  }

  /**
   * Enter salva e pula pro próximo campo AINDA VAZIO.
   *
   * ⚠️ Grava direto em vez de só chamar `blur()` e deixar o `onBlur` fazer.
   * A primeira versão fazia isso e o Enter simplesmente não salvava — o blur
   * disparado por código nem sempre chega ao handler do React. Salvar aqui é
   * explícito e não depende de efeito colateral do foco.
   */
  function aoTeclar(
    e: React.KeyboardEvent<HTMLInputElement>,
    item: ItemCusto,
    idx: number,
  ) {
    if (e.key !== "Enter") return
    e.preventDefault()

    const k = chave(item)
    void salvar(item, e.currentTarget.value)
    setLocal((p) => {
      const n = { ...p }
      delete n[k]
      return n
    })

    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-custo]"),
    )
    const proximo =
      inputs.slice(idx + 1).find((el) => el.value.trim() === "") ??
      inputs[idx + 1]
    proximo?.focus()
    proximo?.select()
  }

  /**
   * Cobertura, lucro e "faltam N linhas" recalculados do overlay.
   *
   * O servidor manda esses números prontos, mas eles ficariam parados até o
   * refresh chegar — e é justamente a barra de progresso que dá o retorno de
   * "está andando" pra quem preenche linha a linha. Mesmas contas de
   * `getCustoItens`; sem otimismo, cai no valor do servidor.
   */
  const vivo = React.useMemo(() => {
    if (Object.keys(otimista).length === 0) {
      return {
        receitaComCusto: resumo.receitaComCusto,
        cobertura: resumo.cobertura,
        lucroMes: resumo.lucroMes,
        faltamPara90: resumo.faltamPara90,
      }
    }
    const receitaComCusto = itensExibidos
      .filter((i) => i.custo !== null)
      .reduce((s, i) => s + i.receita, 0)
    const alvo = resumo.receitaTotal * 0.9
    let acumulado = receitaComCusto
    let faltamPara90 = 0
    if (resumo.receitaTotal > 0 && acumulado < alvo) {
      for (const i of itensExibidos.filter((x) => x.custo === null)) {
        acumulado += i.receita
        faltamPara90++
        if (acumulado >= alvo) break
      }
    }
    return {
      receitaComCusto,
      cobertura:
        resumo.receitaTotal > 0 ? receitaComCusto / resumo.receitaTotal : 0,
      lucroMes: itensExibidos.reduce((s, i) => s + (i.lucroMes ?? 0), 0),
      faltamPara90,
    }
  }, [itensExibidos, otimista, resumo])

  const pct = Math.round(vivo.cobertura * 100)

  /** TEMPORÁRIO — diagnóstico do carregamento. Sai junto com o `diag`. */
  const diag = resumo.diag

  return (
    <div className="flex flex-col gap-3">
      {/* ── Cobertura ─────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-sm font-semibold">{lojaNome}</span>
          <div className="relative h-1.5 min-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums text-emerald-600">
            {pct}% da receita
          </span>
          {vivo.faltamPara90 > 0 ? (
            <span className="text-xs text-muted-foreground">
              faltam {vivo.faltamPara90}{" "}
              {vivo.faltamPara90 === 1 ? "linha" : "linhas"} pra 90%
            </span>
          ) : (
            resumo.receitaTotal > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                cobertura suficiente
              </span>
            )
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <Kpi rot="Receita no mês" val={fmtBRL(resumo.receitaTotal)} />
          <Kpi rot="Com custo preenchido" val={fmtBRL(vivo.receitaComCusto)} />
          <Kpi
            rot="Lucro bruto do mês"
            val={fmtBRL(vivo.lucroMes)}
            forte
            aviso={vivo.cobertura < 0.999}
          />
          <Kpi rot="Itens vendidos" val={fmtNum(resumo.itens.length)} />
        </div>
        {resumo.janelaIfood && (
          <p
            className={
              resumo.janelaIfood.foraDoMes
                ? "mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "mt-2 text-[11px] leading-relaxed text-muted-foreground"
            }
          >
            O iFood desta loja vem do relatório de{" "}
            <b>
              {dataBr(resumo.janelaIfood.inicio)} a{" "}
              {dataBr(resumo.janelaIfood.fim)}
            </b>{" "}
            ({resumo.janelaIfood.dias}{" "}
            {resumo.janelaIfood.dias === 1 ? "dia" : "dias"}) — é o período
            escolhido ao exportar.
            {resumo.janelaIfood.foraDoMes && (
              <>
                {" "}
                <b>Ele começa em outro mês</b>, então a receita do iFood aqui
                inclui dias de fora e não é a do mês selecionado. Pra corrigir,
                exporte o relatório com o período do mês e importe de novo.
              </>
            )}
          </p>
        )}
        {vivo.cobertura < 0.999 && resumo.receitaTotal > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            O lucro acima soma <b>só as linhas que já têm custo</b> — hoje {pct}%
            da receita. Não é o lucro da loja inteira enquanto essa barra não
            fechar.
          </p>
        )}

        {/* TEMPORÁRIO — some assim que a causa aparecer. */}
        {diag && (
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
            {`diag · linhas=${diag.linhas} erro=${diag.erro ?? "nenhum"}
mapas: custo=${diag.mapaCusto} categoria=${diag.mapaCategoria} preco=${diag.mapaPrecoVenda}
${diag.chaves.join("\n")}`}
          </pre>
        )}
      </div>

      {/* ── Oferta de aplicar em lote ─────────────────────────────── */}
      {oferta && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5">
          <p className="text-sm font-semibold">
            Aplicar {fmtBRL(oferta.custo)} em outras linhas?
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Estes nomes parecem a mesma comida. Os de{" "}
            <b>preço muito diferente</b> vêm desmarcados — costumam ser porção
            maior (&quot;prato galera&quot;, &quot;proteína em dobro&quot;), e
            aí o custo não é o mesmo.
          </p>
          <ul className="mt-2 space-y-1">
            {oferta.alvos.map((a) => {
              const k = chave(a)
              const marcado = oferta.marcados.has(k)
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) =>
                        setOferta((p) => {
                          if (!p) return p
                          const s = new Set(p.marcados)
                          if (e.target.checked) s.add(k)
                          else s.delete(k)
                          return { ...p, marcados: s }
                        })
                      }
                      className="size-3.5 accent-primary"
                    />
                    <PlatformLogo platform={a.platform} size="sm" />
                    <span className={marcado ? "" : "text-muted-foreground"}>
                      {a.nomeItem}
                    </span>
                    <span
                      className={
                        precoParecido(oferta.precoBase, a.precoMedio)
                          ? "ml-auto text-[11px] tabular-nums text-muted-foreground"
                          : "ml-auto text-[11px] font-semibold tabular-nums text-amber-600"
                      }
                    >
                      {fmtBRL(a.precoMedio)}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={aplicarLote}
              disabled={salvando === "lote"}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {salvando === "lote" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Aplicar em {oferta.marcados.size}
            </button>
            <button
              onClick={() => setOferta(null)}
              className="px-2 text-xs text-muted-foreground"
            >
              Agora não
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:bg-rose-950">
          {erro}
        </p>
      )}

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item…"
            className="h-9 w-56 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        {/* Só as plataformas que ESTE mês tem: chip sem item por trás é um
            filtro que só sabe devolver tela vazia. */}
        {plataformasComItem.length > 1 && (
          <div className="flex items-center gap-1">
            {plataformasComItem.map((p) => (
              <button
                key={p}
                onClick={() => setPlataforma(plataforma === p ? "" : p)}
                title={p}
                className={
                  plataforma === p
                    ? "rounded-lg border border-primary bg-primary/10 px-2 py-1.5"
                    : "rounded-lg border px-2 py-1.5 opacity-60 hover:opacity-100"
                }
              >
                <PlatformLogo platform={p} size="sm" />
              </button>
            ))}
          </div>
        )}

        {opcoesCategoria.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-9 rounded-lg border bg-background px-2.5 text-xs outline-none focus:border-ring"
            aria-label="Categoria"
          >
            <option value="">Todas as categorias</option>
            {opcoesCategoria.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__sem__">Sem categoria</option>
          </select>
        )}

        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={soSemCusto}
            onChange={(e) => setSoSemCusto(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Só os que faltam
        </label>
        <span className="text-xs text-muted-foreground">
          {visiveis.length} de {resumo.itens.length}
        </span>
      </div>

      {/* ── A lista ───────────────────────────────────────────────── */}
      {resumo.itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum item vendido neste mês para esta loja.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os visíveis"
                    checked={
                      visiveis.length > 0 &&
                      visiveis.every((i) => selecao.has(chave(i)))
                    }
                    onChange={(e) => {
                      // Marca só o que ESTÁ FILTRADO. Marcar 150 itens quando a
                      // tela mostra 12 é a forma mais rápida de aplicar custo
                      // onde ninguém queria.
                      setSelecao((p) => {
                        const n = new Set(p)
                        for (const i of visiveis) {
                          if (e.target.checked) n.add(chave(i))
                          else n.delete(chave(i))
                        }
                        return n
                      })
                    }}
                    className="size-3.5 accent-primary"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Item</th>
                <th className="px-3 py-2.5 text-left font-medium">Categoria</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Receita no mês
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Preço de venda
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Preço médio
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Desconto</th>
                <th className="px-3 py-2.5 text-right font-medium">Custo</th>
                <th className="px-3 py-2.5 text-right font-medium">Taxas</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Lucro bruto
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i, idx) => {
                const k = chave(i)
                const valor =
                  local[k] ??
                  (i.custo === null
                    ? ""
                    : String(i.custo).replace(".", ","))
                return (
                  <tr
                    key={k}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${i.nomeItem}`}
                        checked={selecao.has(k)}
                        onChange={(e) =>
                          setSelecao((p) => {
                            const n = new Set(p)
                            if (e.target.checked) n.add(k)
                            else n.delete(k)
                            return n
                          })
                        }
                        className="size-3.5 accent-primary"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <PlatformLogo platform={i.platform} size="sm" />
                        <span className="font-medium">{i.nomeItem}</span>
                      </div>
                      <span className="ml-6 text-[11px] text-muted-foreground">
                        {fmtNum(i.qtd)} un
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <SeletorCategoria
                        valor={i.categoria}
                        opcoes={opcoesCategoria}
                        className="w-32"
                        onEscolher={(v) => {
                          // A linha muda na hora; o refresh confirma depois.
                          setOtimista((p) => ({
                            ...p,
                            [k]: {
                              ...p[k],
                              categoria: {
                                valor: v.trim() === "" ? null : v,
                                base: i.categoria,
                              },
                            },
                          }))
                          void salvarCategoriaItem({
                            unitId,
                            platform: i.platform,
                            nomeItem: i.nomeItem,
                            categoria: v,
                          }).then((r) => {
                            if (r.ok) router.refresh()
                            else {
                              setErro(r.erro ?? "Não deu.")
                              setOtimista((p) => {
                                const n = { ...p }
                                if (n[k]) delete n[k].categoria
                                return n
                              })
                            }
                          })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtBRL(i.receita)}
                    </td>
                    {/* Preço de TABELA — digitado. Ver migration 0217: não
                        existe em relatório nem API do iFood. */}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {salvandoPreco === k && (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        )}
                        {salvandoPreco !== k && i.precoVenda !== null && (
                          <Check className="size-3 text-emerald-600" />
                        )}
                      <input
                        inputMode="decimal"
                        value={
                          localPreco[k] ??
                          (i.precoVenda === null
                            ? ""
                            : String(i.precoVenda).replace(".", ","))
                        }
                        placeholder="—"
                        onChange={(e) =>
                          setLocalPreco((p) => ({ ...p, [k]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            void salvarPreco(i, e.currentTarget.value)
                            e.currentTarget.blur()
                          }
                        }}
                        onBlur={(e) => {
                          void salvarPreco(i, e.target.value)
                          setLocalPreco((p) => {
                            const n = { ...p }
                            delete n[k]
                            return n
                          })
                        }}
                        className="w-20 rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none hover:border-border focus:border-ring"
                      />
                      </div>
                    </td>

                    {/* Preço MÉDIO — o que entrou de verdade. Só leitura. */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtBRL(i.precoMedio)}
                    </td>

                    {/* Desconto = tabela − médio. Traço enquanto não há preço:
                        zero aqui afirmaria "vendeu sem desconto", que é uma
                        informação que a tela ainda não tem. */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.desconto === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            i.desconto > 0.005
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"
                          }
                        >
                          {i.desconto > 0.005 ? `−${fmtBRL(i.desconto)}` : fmtBRL(0)}
                          {i.descontoPct !== null && i.desconto > 0.005 && (
                            <span className="ml-1 text-[10px] opacity-70">
                              {fmtPct(i.descontoPct * 100)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {salvando === k && (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        )}
                        {salvando !== k && i.custo !== null && (
                          <Check className="size-3 text-emerald-600" />
                        )}
                        <input
                          data-custo
                          inputMode="decimal"
                          value={valor}
                          placeholder="0,00"
                          onChange={(e) =>
                            setLocal((p) => ({ ...p, [k]: e.target.value }))
                          }
                          onKeyDown={(e) => aoTeclar(e, i, idx)}
                          onBlur={(e) => {
                            void salvar(i, e.target.value)
                            setLocal((p) => {
                              const n = { ...p }
                              delete n[k]
                              return n
                            })
                          }}
                          className="w-20 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-ring"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {i.taxaPct > 0 ? (
                        <>
                          {fmtBRL(i.taxaValor)}
                          <span className="ml-1 text-[10.5px] opacity-70">
                            {fmtPct(i.taxaPct * 100, 1)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.lucro === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span
                            className={
                              i.lucro >= 0
                                ? "font-semibold text-emerald-600"
                                : "font-semibold text-rose-600"
                            }
                          >
                            {fmtBRL(i.lucro)}
                          </span>
                          <span className="ml-1 text-[10.5px] text-muted-foreground">
                            {fmtPct((i.lucroPct ?? 0) * 100, 1)}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <BarraMassa
        selecionados={itensExibidos.filter((i) => selecao.has(chave(i)))}
        categorias={opcoesCategoria}
        ocupado={salvando === "massa"}
        onLimpar={() => setSelecao(new Set())}
        onAplicar={(x) => void aplicarMassa(x)}
      />

      {/* ── De onde vêm os percentuais ────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          O que a plataforma reteve desta loja no mês
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {(
            Object.entries(resumo.taxaPorPlataforma) as [
              keyof typeof resumo.taxaPorPlataforma,
              (typeof resumo.taxaPorPlataforma)[keyof typeof resumo.taxaPorPlataforma],
            ][]
          )
            .filter(([, t]) => t.temDado)
            .map(([p, t]) => (
              <div key={p} className="flex items-center gap-2 text-xs">
                <PlatformLogo platform={p} size="sm" />
                <span className="font-semibold tabular-nums">
                  {fmtPct(t.cargaTotalPct * 100, 1)}
                </span>
                <span className="text-muted-foreground">
                  do bruto — é o que entra na conta de cada item
                </span>
                {t.cargaTotalPct > t.comissaoPct + 0.005 && (
                  <span className="text-muted-foreground">
                    · sendo {fmtPct(t.comissaoPct * 100, 1)} de comissão e o
                    resto entrega, promoção e demais descontos
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>Preço de venda</b> é o preço de tabela do seu cardápio — você digita,
        porque nenhuma plataforma manda esse número em relatório. <b>Preço
        médio</b> é a receita dividida pela quantidade: o que entrou de verdade,
        já com promoção e com qualquer mudança de preço no período. A diferença
        entre os dois é o <b>desconto</b> que o item deu.{" "}
        <b>Taxas</b> é tudo que a plataforma reteve da loja no mês (comissão,
        entrega, taxa de serviço e demais descontos), aplicado como percentual
        sobre o item. Como a entrega é cobrada por pedido e não por item, ela
        está sendo <b>rateada por receita</b> — não existe, em plataforma
        nenhuma, o dado de qual entrega pertence a qual item.{" "}
        <b>Lucro bruto</b> é <b>preço médio</b> − taxas − custo: sai do dinheiro
        que entrou, não do preço de tabela.
      </p>
    </div>
  )
}

function Kpi({
  rot,
  val,
  forte = false,
  aviso = false,
}: {
  rot: string
  val: string
  forte?: boolean
  aviso?: boolean
}) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {rot}
        {aviso && <span className="ml-1 text-amber-600">parcial</span>}
      </p>
      <p
        className={
          forte
            ? "text-lg font-bold tabular-nums text-emerald-600"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {val}
      </p>
    </div>
  )
}

/**
 * Preços perto o bastante pra ser a mesma porção.
 *
 * ⚠️ Nasceu de um erro visto na tela: "Sobrecoxa Desossada Defumada" casou por
 * nome com "…Prato Galera", "…Proteína em Dobro" e "…Maior quantidade", que são
 * porções maiores e custam mais. O nome não distingue; o preço sim.
 *
 * 15% é folga pra diferença de preço entre plataformas do MESMO prato (que
 * existe e é normal) sem alcançar uma porção dobrada.
 */
function precoParecido(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) / Math.max(a, b) <= 0.15
}

/** Sem acento, sem pontuação, sem selo de marketing. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(mais pedido|top\s*five|novo|promocional|promocao)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Linhas SEM custo que provavelmente são a mesma comida.
 *
 * Casa por nome normalizado igual ou por um conter o outro — é o que pega
 * "Sobrecoxa Desossada Defumada" e "Churrasco de Sobrecoxa Desossada
 * Defumada", que é o caso real entre Keeta, 99 e iFood da mesma loja.
 *
 * ⚠️ Exige 12 caracteres pra aceitar "um contém o outro". Sem isso, "Coca"
 * casaria com metade do cardápio e a oferta viraria uma armadilha.
 */
function semelhantes(base: ItemCusto, todos: ItemCusto[]): ItemCusto[] {
  const a = normalizar(base.nomeItem)
  if (a.length < 6) return []
  return todos.filter((o) => {
    if (o.custo !== null) return false
    if (o.platform === base.platform && o.nomeItem === base.nomeItem) return false
    const b = normalizar(o.nomeItem)
    if (a === b) return true
    if (a.length >= 12 && b.includes(a)) return true
    if (b.length >= 12 && a.includes(b)) return true
    return false
  })
}

/** Dia/mês curto — o ano já está no seletor de período do topo. */
function dataBr(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}
