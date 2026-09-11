import { notFound } from "next/navigation"

import { ContratoClausulas } from "@/components/legal/contrato-clausulas"
import { getAdesaoPorToken } from "@/lib/data/contrato-adesao"
import {
  CONTRATADA,
  CONTRATO_ATUALIZADO_EM,
  CONTRATO_VERSAO,
  brl,
  condicoesDoTermo,
  dataBR,
  rotuloCicloAdesao,
} from "@/lib/contrato-adesao-texto"

import { BotaoImprimir } from "./_components/botao-imprimir"

/**
 * O Termo de Adesão de um cliente — público, pelo token do link.
 *
 * É o link que vai no e-mail quando o pagamento confirma e o que a tela de
 * Assinatura abre. Sem login de propósito: o documento precisa abrir na mão
 * de quem vai guardá-lo (o contador, o sócio), e o que o protege é o token de
 * 24 bytes, um por termo.
 *
 * ⚠️ `noindex` NÃO É DETALHE: a página tem CNPJ, endereço e preço do cliente.
 *
 * O texto das condições sai da MESMA função que o servidor usou pra calcular o
 * hash no aceite (`condicoesDoTermo`). Se esta página montasse o texto por
 * conta própria, o comprovante provaria o aceite de um documento que ninguém
 * leu.
 */
export const metadata = {
  title: "Termo de Adesão — Delivery OS",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function TermoAdesaoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const t = await getAdesaoPorToken(token)
  // Token errado e termo cancelado caem aqui com a MESMA cara.
  if (!t) notFound()

  const d = t.dados
  const condicoes = condicoesDoTermo(d)
  const doze = !d.plano.personalizado && d.ciclo === "anual_12x"
  const anual = !d.plano.personalizado && d.ciclo === "anual"
  const valor = doze
    ? `${d.parcelas ?? 12}x de ${brl(d.valorMensal)} (total ${brl(d.valorCiclo)})`
    : anual
      ? `${brl(d.valorCiclo)} à vista por 12 meses (equivale a ${brl(d.valorMensal)}/mês)`
      : `${brl(d.valorMensal)} por mês`
  const quando = new Date(t.aceite.em).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "long",
    timeStyle: "short",
  })

  const quadro: [string, string][] = [
    ["Plano", d.plano.nome],
    ["Lojas", String(d.lojas)],
    ["Ciclo", rotuloCicloAdesao(d)],
    ["Valor", valor],
    ["Pagamento", d.formaPagamento],
    ["Início", dataBR(d.inicio)],
  ]
  if (d.fimPrimeiroPeriodo) quadro.push(["Fim do 1º período", dataBR(d.fimPrimeiroPeriodo)])
  if (!d.plano.personalizado)
    quadro.push([
      "Preço-base",
      `${brl(d.plano.precoPrimeiraLoja ?? 0)} a 1ª loja + ${brl(d.plano.precoAdicional ?? 0)} por loja adicional, por mês, no anual à vista`,
    ])

  const registro: [string, string][] = [
    ["Aceito por", t.aceite.nome || "—"],
    ["E-mail da conta", t.aceite.email || "—"],
    ["Data e hora", `${quando} (horário de Brasília)`],
    ["Endereço IP", t.aceite.ip || "—"],
    ["Navegador", t.aceite.userAgent || "—"],
  ]

  return (
    <div className="min-h-screen bg-muted/40 text-foreground print:bg-white">
      <header
        data-print="hide"
        className="border-b bg-background px-5 py-3 print:hidden"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[#ff4d1c] text-[13px] font-black text-white">
              D
            </div>
            <span className="text-sm font-extrabold tracking-tight">
              Delivery<span className="text-[#ff4d1c]">OS</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
              nº {t.numero}
            </span>
            <BotaoImprimir />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
        <article className="rounded-xl border bg-card px-6 py-8 shadow-sm sm:px-10 sm:py-10 print:rounded-none print:border-0 print:shadow-none">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Termo de Adesão nº {t.numero}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight [text-wrap:balance]">
            Contratação do Delivery OS
          </h1>
          <p className="mt-3">
            {t.status === "vigente" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Em vigor desde {dataBR(t.vigenteEm)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Aceito — entra em vigor com a confirmação do pagamento
              </span>
            )}
          </p>

          {/* As partes */}
          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contratada
              </p>
              <p className="mt-1.5 text-sm font-semibold">{CONTRATADA.razaoSocial}</p>
              <p className="text-sm text-muted-foreground">CNPJ {CONTRATADA.cnpj}</p>
              <p className="text-sm text-muted-foreground">
                operadora da plataforma {CONTRATADA.marca}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contratante
              </p>
              <p className="mt-1.5 text-sm font-semibold">{d.contratante.nome}</p>
              {d.contratante.documento && (
                <p className="text-sm text-muted-foreground">
                  {d.contratante.documento.length > 14 ? "CNPJ" : "CPF"}{" "}
                  {d.contratante.documento}
                </p>
              )}
              {d.contratante.endereco && (
                <p className="text-sm text-muted-foreground">{d.contratante.endereco}</p>
              )}
              {d.contratante.email && (
                <p className="text-sm text-muted-foreground">{d.contratante.email}</p>
              )}
            </div>
          </section>

          {/* Quadro-resumo */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Quadro-resumo
            </h2>
            <dl className="mt-3 divide-y rounded-lg border text-sm">
              {quadro.map(([rot, val]) => (
                <div
                  key={rot}
                  className="grid gap-1 px-4 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4"
                >
                  <dt className="text-muted-foreground">{rot}</dt>
                  <dd className="font-medium tabular-nums">{val}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Condições — numeradas porque são cláusulas e são citadas assim. */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Condições da contratação
            </h2>
            <ol className="mt-3 space-y-3 text-sm leading-relaxed">
              {condicoes.map((c, i) => (
                <li key={c.titulo} className="max-w-[68ch]">
                  <span className="font-semibold">
                    {i + 1}. {c.titulo}.
                  </span>{" "}
                  <span className="text-foreground/90">{c.texto}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* O contrato-mestre na íntegra — o mesmo componente de /contrato. */}
          <section className="mt-10 border-t pt-8">
            <h2 className="text-base font-semibold [text-wrap:balance]">
              Contrato de Prestação de Serviços de Software (SaaS) — versão{" "}
              {t.versaoContrato}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.versaoContrato === CONTRATO_VERSAO
                ? `Atualizado em ${CONTRATO_ATUALIZADO_EM}. Reproduzido na íntegra; também em deliveryos.food/contrato.`
                : `Este termo foi aceito na versão ${t.versaoContrato}. O texto abaixo é a versão atual (${CONTRATO_VERSAO}, de ${CONTRATO_ATUALIZADO_EM}); alterações seguem a cláusula 14.1.`}
            </p>
            <div className="legal-prose mt-6 flex flex-col gap-6 text-sm leading-relaxed text-foreground/90">
              <ContratoClausulas />
            </div>
          </section>

          {/* Prova do aceite */}
          <section className="mt-10 break-inside-avoid rounded-lg border bg-muted/30 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Registro do aceite
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Aceite eletrônico nos termos do art. 4º, I, da Lei nº 14.063/2020,
              feito dentro da conta do CONTRATANTE no Delivery OS.
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              {registro.map(([rot, val]) => (
                <div key={rot} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground">{rot}</dt>
                  <dd className="break-words">{val}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Hash do documento (SHA-256)
            </p>
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed">
              {t.hash}
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
