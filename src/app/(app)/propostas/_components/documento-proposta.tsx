"use client"

import type { AceiteProposta, DadosProposta } from "@/lib/data/propostas"
import type { ModeloProposta } from "@/lib/data/proposta-modelo"
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Mail,
  Network,
  Star,
  Store,
  Table2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

/**
 * Id do modelo → componente do ícone.
 *
 * Mora aqui e não no módulo de dados porque importar os ícones lá carregaria a
 * biblioteca inteira em qualquer tela que encostasse no modelo. Id
 * desconhecido cai no neutro em vez de quebrar o documento.
 */
const ICONES = {
  rede: Network,
  loja: Store,
  dinheiro: Wallet,
  planilha: Table2,
  cardapio: UtensilsCrossed,
  email: Mail,
  grafico: BarChart3,
  relogio: Clock,
  estrela: Star,
  alerta: AlertTriangle,
} as const

/**
 * A FOLHA. Isto é o que o cliente recebe — na tela e no PDF, o mesmo componente.
 *
 * Cores fixas (branco/preto/laranja) e não tokens de tema: documento é papel.
 * Se herdasse o tema, quem está no modo escuro veria — e imprimiria — texto
 * preto sobre fundo preto. Já aconteceu na primeira versão em HTML.
 */
const LARANJA = "#ff4d1c"

function brl(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function dataBr(iso: string): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

export function DocumentoProposta({
  modelo,
  numero,
  d,
  aceite = null,
}: {
  numero: string
  d: DadosProposta
  /** Textos padrão (editáveis em /propostas/modelo). */
  modelo: ModeloProposta
  /**
   * Quando existe, as linhas em branco de assinatura dão lugar ao COMPROVANTE.
   *
   * É o que faz o PDF se sustentar sozinho: quem receber o arquivo lê ali quem
   * aceitou, quando, de onde e o hash do conteúdo — sem precisar entrar no
   * sistema pra conferir.
   */
  aceite?: AceiteProposta | null
}) {
  const adicionais = Math.max(Number(d.lojas || 1) - 1, 0)
  // Só o que o plano contratado inclui — o resto vira oferta, não lista de nãos.
  const escopoIncluido = modelo.escopoItens.filter((i) =>
    i.planos.includes(d.plano),
  )
  const foraDoPlano = modelo.escopoItens.filter(
    (i) => !i.planos.includes(d.plano) && i.planos.length > 0,
  )
  const ilimitado = d.modeloPreco === "ilimitado"
  // O total vem de fontes diferentes conforme o modelo: no ilimitado é o valor
  // fechado; no por-loja é a conta que a tabela acima mostra linha a linha.
  const mensal = ilimitado ? Number(d.valorIlimitado || 0) : d.totalMensal
  // Quem já está no AI não recebe oferta do que já tem.
  const podeSubirParaAi = d.plano !== "ai" && foraDoPlano.length > 0

  return (
    <div
      data-doc
      className="mx-auto w-full max-w-[820px] bg-white p-12 text-[13px] leading-relaxed text-zinc-700 shadow-sm print:max-w-none print:p-0 print:shadow-none"
      style={{ colorScheme: "light" }}
    >
      {/* ── Cabeçalho ───────────────────────────────────────────── */}
      {/* ══ CAPA ═══════════════════════════════════════════════════════
          No idioma visual da TELA DE LOGIN: fundo zinc-950, brilhos laranja
          desfocados, grade sutil e a mesma chamada. Quem recebe a proposta e
          depois entra no sistema encontra a mesma frase — um faz o outro
          parecer consequência, não coincidência.

          `print:break-after-page` porque capa dividindo página com conteúdo
          deixa de ser capa. */}
      <div
        className="capa-proposta relative -mx-10 -mt-10 mb-8 flex flex-col overflow-hidden bg-zinc-950 px-10 py-12"
        style={{ minHeight: 560 }}
      >
        <div
          className="pointer-events-none absolute -left-24 -top-16 size-[380px] rounded-full"
          style={{ background: LARANJA, opacity: 0.25, filter: "blur(110px)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 -right-16 size-[320px] rounded-full"
          style={{ background: LARANJA, opacity: 0.15, filter: "blur(110px)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10 flex flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span
              className="grid size-8 place-items-center rounded-lg"
              style={{ background: LARANJA }}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="white">
                <rect x="4" y="12" width="3.2" height="8" rx="1" />
                <rect x="10.4" y="7" width="3.2" height="13" rx="1" />
                <rect x="16.8" y="9.5" width="3.2" height="10.5" rx="1" />
              </svg>
            </span>
            <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/80">
              Delivery OS
            </span>
          </div>

          <div className="my-auto">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.18em] text-white/70">
              Proposta comercial nº {numero}
            </div>
            <h1 className="max-w-[26ch] text-[30px] font-bold leading-[1.15] text-white">
              {modelo.capaTitulo}
            </h1>
            <p className="mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-white/60">
              {modelo.capaSubtitulo}
            </p>
          </div>

          <div className="flex items-end justify-between border-t border-white/10 pt-5">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/40">
                Preparada para
              </p>
              <p className="mt-1 text-[15px] font-bold text-white">
                {d.razaoSocial || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-white/40">
                Válida até
              </p>
              <p className="mt-1 text-[13px] font-semibold text-white">
                {dataBr(d.validadeAte)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: LARANJA }}>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 512 512" className="size-11 rounded-[11px]">
            <rect width="512" height="512" rx="104" fill={LARANJA} />
            <g
              transform="translate(98 98) scale(13.2)"
              fill="none"
              stroke="#fff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </g>
          </svg>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-zinc-900">
              Delivery<span style={{ color: LARANJA }}>OS</span>
            </p>
            <p className="text-[11px] text-zinc-500">
              LAB OF CHANGE LTDA · CNPJ 38.613.971/0001-80
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">
            Proposta comercial
          </p>
          <p className="text-lg font-extrabold tabular-nums text-zinc-900">
            nº {numero}
          </p>
          <p className="text-[11px] text-zinc-500">
            Válida até {dataBr(d.validadeAte)}
          </p>
        </div>
      </div>

      {/* ══ APRESENTAÇÃO — UMA PÁGINA SÓ ══════════════════════════════
          "Quem somos" e "O que muda" ficam juntos numa folha, e o Cliente
          começa na seguinte. Antes eles vazavam pro meio da página do cadastro
          e a história virava rodapé de outra coisa. */}
      <div className="pagina-apresentacao">
        <Titulo>Quem somos</Titulo>
        {modelo.historia.split("\n\n").map((par, i) => (
          <p key={i} className={i > 0 ? "mt-2" : ""}>
            {par}
          </p>
        ))}

        {/* Título com mais peso que os outros: esta é a página que vende, e
            ela precisa parecer o começo de um argumento, não mais uma seção. */}
        <h2
          className="mb-1 mt-8 break-after-avoid text-[19px] font-extrabold leading-tight tracking-tight text-zinc-900"
        >
          O que muda pra quem usa
        </h2>
        <p className="mb-3 border-b pb-3 text-[12px] text-zinc-500" style={{ borderColor: LARANJA }}>
          Não é relatório novo pra olhar. É a sua operação respondendo o que
          você já pergunta todo dia.
        </p>
        {/* Cards com ícone, no mesmo desenho do site: selo arredondado com a
            cor da marca em fundo suave. Numa proposta impressa o ícone faz o
            olho encontrar o bloco antes de ler — que é justamente o que essa
            página precisa fazer. */}
        <div className="grid grid-cols-2 gap-3">
          {modelo.ajudamos.map((b) => {
            const Icone =
              ICONES[(b.icone ?? "grafico") as keyof typeof ICONES] ?? BarChart3
            return (
              <div
                key={b.titulo}
                className="break-inside-avoid rounded-xl border border-zinc-200 p-3.5"
              >
                <span
                  className="mb-2 flex size-9 items-center justify-center rounded-lg"
                  style={{ background: "#fff1ec", color: LARANJA }}
                >
                  <Icone className="size-[18px]" strokeWidth={2} />
                </span>
                <p className="text-[13.5px] font-extrabold leading-tight tracking-tight text-zinc-900">
                  {b.titulo}
                </p>
                <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-600">
                  {b.texto}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Cliente ─────────────────────────────────────────────── */}
      <Titulo>Cliente</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha rot="Razão social" val={d.razaoSocial || "—"} />
          <Linha rot="CNPJ" val={d.cnpj || "—"} />
          <Linha rot="Endereço" val={d.endereco || "—"} />
          <Linha
            rot="Contato"
            val={
              [d.contatoNome, d.contatoEmail, d.contatoTelefone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          {/* Quem assina é o dono; quem paga é o financeiro. Mandar boleto pro
              e-mail de quem assinou é como uma cobrança some por três semanas.
              Quando o cliente não tem financeiro separado, a linha sai fora —
              deixar "—" numa proposta é dizer que faltou preencher. */}
          {!d.ocultarBoleto && (
          <Linha
            rot="Recebe o boleto"
            val={
              [d.contatoBoletoNome, d.contatoBoletoEmail, d.contatoBoletoTelefone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          )}
          {!d.ocultarNf && (
          <Linha
            rot="Recebe a nota fiscal"
            val={
              [d.contatoNfNome, d.contatoNfEmail, d.contatoNfTelefone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          )}
        </tbody>
      </table>

      {/* ── Escopo ──────────────────────────────────────────────── */}
      <Titulo>Escopo contratado</Titulo>
      <p>
        Plano <b className="text-zinc-900">{d.planoLabel}</b>{" "}
        {ilimitado ? (
          <>
            com <b className="text-zinc-900">lojas ilimitadas</b> (hoje{" "}
            {d.lojas}) e usuários ilimitados.
          </>
        ) : (
          <>
            para <b className="text-zinc-900">{d.lojas}</b>{" "}
            {d.lojas === 1 ? "loja" : "lojas"}, com usuários ilimitados.
          </>
        )}
      </p>
      {/* ⚠️ ITEM A ITEM, INCLUSIVE O QUE NÃO ENTRA.
          Era a lacuna mais séria da versão anterior, que resolvia o escopo num
          parágrafo. Sem a lista do que fica DE FORA, "eu achei que tinha
          relatório de X" vira discussão no quarto mês — e sempre com quem já
          está pagando. O "–" é tão importante quanto o "✓". */}
      {/* ⚠️ SÓ O QUE ESTÁ INCLUÍDO (Marcus, 16/08/26).
          A versão anterior listava também o que NÃO entrava, com "–", pelo
          argumento de evitar "achei que tinha isso". O Marcus trocou por algo
          melhor: em vez de uma lista do que falta, o que não entra vira OFERTA
          no bloco seguinte, com preço e a informação de que a fatura se ajusta
          sozinha. Uma proposta comercial não precisa de uma coluna de nãos. */}
      <table className="mt-2 w-full border-collapse text-[11.5px]">
        <tbody>
          {escopoIncluido.map((item) => (
            <tr key={item.recurso} className="border-b border-zinc-100">
              <td className="py-1 pr-2">
                <span style={{ color: LARANJA }} className="mr-2 font-bold">
                  ✓
                </span>
                {item.recurso}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-500">
        Onde a integração automática não estiver disponível, a importação por
        planilha continua valendo.
      </p>

      {/* ── Investimento ────────────────────────────────────────── */}
      {/* ⚠️ BLOCO INDIVISÍVEL. A tabela estava partindo no meio: a linha da 1ª
          loja ficava numa página e o resto na seguinte, com o cabeçalho preto
          repetido — parecia duas tabelas diferentes, e o total aparecia longe
          das linhas que o formam. Numa proposta comercial isso é pior que
          feio: o cliente lê o total sem ver a conta.

          `break-inside: avoid` empurra o bloco inteiro pra próxima folha se
          ele não couber. É seguro porque são no máximo 6 linhas — o escopo,
          que é longo de verdade, continua livre pra quebrar. */}
      <div className="break-inside-avoid">
      <Titulo>Investimento</Titulo>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-zinc-900 text-white">
            <th className="p-2 text-left text-[10px] font-bold uppercase tracking-wider">Item</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Qtd.</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Unitário</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Mensal</th>
          </tr>
        </thead>
        <tbody>
          {/* ⚠️ DUAS FORMAS DE COBRAR, e a diferença não é cosmética.
              No "ilimitado" o valor foi negociado INTEIRO — mostrar "58 × R$ 79
              menos um desconto de R$ 1.102" reconstrói uma conta que nunca
              existiu, e o cliente pergunta de onde saiu o desconto. */}
          {ilimitado ? (
            <tr className="border-b">
              <td className="p-2">
                {d.planoLabel} — lojas ilimitadas
              </td>
              <td className="p-2 text-right tabular-nums">{d.lojas} hoje</td>
              <td className="p-2 text-right">—</td>
              <td className="p-2 text-right tabular-nums">
                {brl(d.valorIlimitado)}
              </td>
            </tr>
          ) : (
            <>
              <tr className="border-b">
                <td className="p-2">{d.planoLabel} — 1ª loja</td>
                <td className="p-2 text-right tabular-nums">1</td>
                <td className="p-2 text-right tabular-nums">{brl(d.precoPrimeira)}</td>
                <td className="p-2 text-right tabular-nums">{brl(d.precoPrimeira)}</td>
              </tr>
              {adicionais > 0 && (
                <tr className="border-b bg-zinc-50">
                  <td className="p-2">{d.planoLabel} — lojas adicionais</td>
                  <td className="p-2 text-right tabular-nums">{adicionais}</td>
                  <td className="p-2 text-right tabular-nums">{brl(d.precoAdicional)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {brl(d.precoAdicional * adicionais)}
                  </td>
                </tr>
              )}
              {Number(d.descontoMensal) > 0 && (
                <tr className="border-b">
                  <td className="p-2">Desconto comercial</td>
                  <td className="p-2 text-right">—</td>
                  <td className="p-2 text-right">—</td>
                  <td className="p-2 text-right tabular-nums">
                    −{brl(d.descontoMensal)}
                  </td>
                </tr>
              )}
            </>
          )}
          <tr style={{ background: "#fff7ed", borderTop: `2px solid ${LARANJA}` }}>
            <td className="p-2 font-extrabold text-zinc-900" colSpan={3}>
              Total mensal
            </td>
            <td className="p-2 text-right font-extrabold tabular-nums text-zinc-900">
              {brl(mensal)}
            </td>
          </tr>
          {/* ⚠️ SEM "total do período" (Marcus, 16/08/26): "o valor alto pode
              assustar a pessoa". R$ 42.000 dito de uma vez é um número que
              muda a conversa, mesmo sendo a mesma mensalidade que a linha de
              cima — e a proposta não deixa de informar o compromisso, porque a
              seção Vigência continua dizendo 12 meses com todas as letras. */}
        </tbody>
      </table>

      <table className="mt-3 w-full text-[12px]">
        <tbody>
          {/* Desligado some, não vira "—": linha com traço numa proposta diz
              que faltou preencher, não que não faz parte da oferta. */}
          {d.setupAtivo && <Linha rot="Setup inicial" val={d.setup || "—"} />}
          {d.treinamentoAtivo && (
            <Linha rot="Treinamento" val={d.treinamento || "—"} />
          )}
        </tbody>
      </table>

      </div>

      {/* ── Como cresce ─────────────────────────────────────────── */}
      {/* O que não está no plano vira OFERTA, com preço e a promessa de que a
          cobrança se ajusta sozinha. É a diferença entre "isso você não tem" e
          "isso você pode ter, e é assim". */}
      <div className="break-inside-avoid">
      <Titulo>Se precisar de mais</Titulo>
      <div className="space-y-2">
        {podeSubirParaAi && (
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-[12px] font-bold text-zinc-900">
              Nino AI e diagnóstico por inteligência artificial
            </p>
            <p className="mt-1 text-[11.5px] leading-snug">
              {/* Sem toLowerCase: ele transformava "Nino AI" em "nino ai". */}
              {foraDoPlano.length > 0 && (
                <>Inclui: {foraDoPlano.map((f) => f.recurso).join(" · ")}. </>
              )}
              A qualquer momento você habilita no próprio sistema:{" "}
              {ilimitado ? (
                <>
                  o valor passa a ser combinado sobre a sua mensalidade atual
                </>
              ) : (
                <>
                  a mensalidade passa de {brl(d.precoPrimeira)} para{" "}
                  {brl(d.precoAiPrimeira)} na primeira loja e de{" "}
                  {brl(d.precoAdicional)} para {brl(d.precoAiAdicional)} nas
                  adicionais
                </>
              )}
              , e <b className="text-zinc-900">a fatura é atualizada
              automaticamente</b> — sem nova proposta e sem religar nada.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-[12px] font-bold text-zinc-900">
            Lojas novas entram quando você quiser
          </p>
          <p className="mt-1 text-[11.5px] leading-snug">
            {ilimitado ? (
              <>
                Neste formato as lojas são <b className="text-zinc-900">ilimitadas</b>:
                cadastre quantas precisar, sem mudar a mensalidade.
              </>
            ) : (
              <>
                Cada loja nova custa{" "}
                <b className="text-zinc-900">{brl(d.precoAdicional)} por mês</b> e
                começa a ser cobrada proporcionalmente a partir da ativação. Você
                cadastra pelo sistema e{" "}
                <b className="text-zinc-900">o pagamento se ajusta sozinho</b> — a
                exclusão vale a partir do ciclo seguinte.
              </>
            )}
          </p>
        </div>
      </div>
      </div>

      {/* ── Cronograma ──────────────────────────────────────────── */}
      {/* A Mercos lista as 12 parcelas com data. Aqui a mensalidade é fixa, então
          repetir doze linhas iguais seria encher página — o que a pessoa
          precisa saber é QUANDO começa e QUANDO vence cada uma. */}
      <div className="break-inside-avoid">
      <Titulo>Pagamento</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha
            rot="Primeira cobrança"
            val={
              d.inicioCobranca
                ? dataBr(d.inicioCobranca)
                : "Na contratação"
            }
          />
          <Linha rot="Demais parcelas" val={`Todo dia ${d.vencimentoDia}, por 12 meses`} />
          <Linha rot="Faturamento" val={modelo.faturamento} />
          <Linha
            rot="Meios de pagamento"
            val="Cartão de crédito, boleto ou PIX (Asaas), com NFS-e automática"
          />
          <Linha
            rot="Reajuste"
            val="Anual, pelo IPCA/IBGE, na data de aniversário do contrato"
          />
        </tbody>
      </table>

      </div>

      {/* ── Atendimento e condições ─────────────────────────────── */}
      <div className="break-inside-avoid">
      <Titulo>Atendimento e condições</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha rot="Atendimento" val={modelo.atendimento} />
          <Linha rot="Novas lojas" val={modelo.contratarMais} />
          <Linha rot="Treinamento" val={modelo.treinamentoPrazo} />
        </tbody>
      </table>

      </div>

      {/* ── Vigência ────────────────────────────────────────────── */}
      <Titulo>Vigência</Titulo>
      <p>
        <b className="text-zinc-900">12 (doze) meses</b>, renováveis
        automaticamente por iguais períodos, salvo manifestação escrita de
        qualquer das partes com 30 (trinta) dias de antecedência.
      </p>

      {d.observacoes && (
        <>
          <Titulo>Observações</Titulo>
          <p className="whitespace-pre-wrap">{d.observacoes}</p>
        </>
      )}

      {/* ── Termo de aceite ─────────────────────────────────────── */}
      <div className="mt-8 break-inside-avoid rounded-lg border-2 p-5" style={{ borderColor: LARANJA }}>
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: LARANJA }}>
          Termo de aceite
        </p>
        <p className="text-[12px]">{modelo.termoAceite}</p>
        <p className="mt-2 text-[12px]">
          Esta proposta obedece integralmente ao{" "}
          <b className="text-zinc-900">
            Contrato de Prestação de Serviços de Software (SaaS) — Delivery OS
          </b>
          , do qual é parte integrante e complementar, disponível em{" "}
          <b className="text-zinc-900">
            {modelo.contratoUrl.replace(/^https?:\/\//, "")}
          </b>
          .
        </p>

        {aceite ? (
          <ComprovanteAceite a={aceite} />
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-zinc-800 pb-6" />
              <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Nome do representante legal
              </p>
            </div>
            <div>
              <div className="border-b border-zinc-800 pb-6" />
              <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                CNPJ
              </p>
            </div>
            <div>
              <div className="border-b border-zinc-800 pb-6" />
              <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Assinatura
              </p>
            </div>
            <div>
              <div className="border-b border-zinc-800 pb-6" />
              <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Data
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Protege contra "não usei, não pago" e contra o número mudar sem
          documento novo. A Mercos põe isso em nota de rodapé; mesma ideia. */}
      <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
        {modelo.rodapeValores}
      </p>

      <p className="mt-3 text-[10px] text-zinc-500">
        Consultor: {d.consultorNome || "—"}
        {d.consultorEmail ? ` · ${d.consultorEmail}` : ""} · Delivery OS ·
        deliveryos.food
      </p>
    </div>
  )
}

/**
 * O comprovante que substitui as linhas de assinatura.
 *
 * Traz os quatro elementos que sustentam uma assinatura eletrônica simples
 * (Lei 14.063/2020, art. 4º, I): QUEM, QUANDO, DE ONDE e SOBRE O QUÊ. O hash é
 * o "sobre o quê" — sem ele, o comprovante prova que alguém clicou, mas não em
 * qual texto.
 *
 * Fonte monoespaçada no hash de propósito: é um dado pra conferir caractere a
 * caractere, não pra ler.
 */
function ComprovanteAceite({ a }: { a: AceiteProposta }) {
  const dt = new Date(a.em)
  const quando = dt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  })
  const doc = a.cpf.replace(/\D/g, "")
  const docFmt =
    doc.length === 11
      ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
      : doc.length === 14
        ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
        : doc

  return (
    <div className="mt-6 rounded-md bg-zinc-50 p-4">
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-zinc-900">
        ✓ Aceito eletronicamente
      </p>
      <table className="w-full text-[11.5px]">
        <tbody>
          <tr>
            <td className="w-[130px] py-0.5 pr-3 align-top text-zinc-500">
              Aceito por
            </td>
            <td className="py-0.5 align-top font-semibold text-zinc-900">
              {a.nome}
              {a.cargo ? ` · ${a.cargo}` : ""}
            </td>
          </tr>
          <tr>
            <td className="py-0.5 pr-3 align-top text-zinc-500">CPF/CNPJ</td>
            <td className="py-0.5 align-top text-zinc-900">{docFmt || "—"}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-3 align-top text-zinc-500">E-mail</td>
            <td className="py-0.5 align-top text-zinc-900">{a.email || "—"}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-3 align-top text-zinc-500">
              Data e hora
            </td>
            <td className="py-0.5 align-top text-zinc-900">
              {quando} (horário de Brasília)
            </td>
          </tr>
          <tr>
            <td className="py-0.5 pr-3 align-top text-zinc-500">Endereço IP</td>
            <td className="py-0.5 align-top text-zinc-900">{a.ip || "—"}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-3 align-top text-zinc-500">
              Hash do documento
            </td>
            <td className="py-0.5 align-top font-mono text-[9.5px] leading-snug text-zinc-700">
              {a.hash}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2.5 text-[10px] leading-relaxed text-zinc-500">
        Aceite eletrônico registrado pela plataforma Delivery OS nos termos do
        art. 4º, I, da Lei nº 14.063/2020. O hash acima (SHA-256) identifica de
        forma única o conteúdo desta proposta: qualquer alteração no documento
        produz um hash diferente.
      </p>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 mt-7 break-after-avoid border-b pb-1 text-[13px] font-extrabold tracking-tight text-zinc-900"
      style={{ borderColor: LARANJA }}
    >
      {children}
    </h2>
  )
}

function Linha({ rot, val }: { rot: string; val: string }) {
  return (
    <tr>
      <td className="w-[170px] py-1 pr-3 align-top text-zinc-500">{rot}</td>
      <td className="py-1 align-top text-zinc-900">{val}</td>
    </tr>
  )
}
