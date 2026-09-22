"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Play, Plug, X, Zap } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"

/**
 * "Seu primeiro relatório" — a Importação enxuta pra quem está começando.
 *
 * A tela completa lista 13 relatórios, todos em vermelho "falta", com um guia
 * de 5 passos por cima. Pra quem chega do roteiro ("veja os números da sua
 * loja hoje"), isso é um muro: a pergunta dele é "qual arquivo eu baixo?", e a
 * resposta tem que ser UM (Marcus, 22/09/26). Aqui fica só o relatório que
 * sozinho já monta o painel — faturamento, taxas e quanto sobra — de cada
 * plataforma, com o link direto do portal e o vídeo. O resto continua na tela
 * completa, a um clique.
 */

const TUT =
  "https://srgmmqihgvkmwjkorkva.supabase.co/storage/v1/object/public/tutoriais/"

type Primeiro = {
  relatorio: string
  mostra: string
  passos: string[]
  link: { label: string; href: string }
  video: string
}

type Plat = "ifood" | "99food" | "keeta"

const PRIMEIRO: Record<Plat, Primeiro> = {
  ifood: {
    relatorio: "Financeiro (Conciliação)",
    mostra:
      "faturamento, todas as taxas que o iFood descontou, cancelamentos e quanto sobrou pra você no mês.",
    passos: [
      "Abra o Financeiro no portal do iFood (botão abaixo) e entre com o login da loja.",
      "Escolha o mês atual e clique em Exportar — baixa um arquivo XLSX.",
      "Arraste esse arquivo no quadro aqui embaixo. Tem mais de uma loja? O iFood exporta uma por vez: repita pra cada uma.",
    ],
    link: {
      label: "Abrir o Financeiro do iFood",
      href: "https://portal.ifood.com.br/revenue/billaas/home",
    },
    video: `${TUT}ifood-financeiro.mp4`,
  },
  "99food": {
    relatorio: "Dados da loja",
    mostra:
      "faturamento, comissão, sua nota, taxa de aceitação e tempo de preparo na 99.",
    passos: [
      "Abra os Relatórios no portal da 99 (botão abaixo).",
      "Escolha o período do mês, a loja e “Selecionar todos os dados” → Enviar. Na aba “Baixar relatório”, baixe.",
      "Arraste o arquivo aqui embaixo — pode ser o .zip do jeito que veio.",
    ],
    link: {
      label: "Abrir os Relatórios da 99",
      href: "https://merchant.99app.com/pt-BR/manager/report",
    },
    video: `${TUT}99-loja.mp4`,
  },
  keeta: {
    relatorio: "Dados do restaurante",
    mostra:
      "faturamento, pedidos, cancelados e tempo de preparo da loja na Keeta.",
    passos: [
      "Abra “Baixar dados” no portal da Keeta (botão abaixo).",
      "Escolha o período do mês, o restaurante e “Selecionar todos os dados” → Enviar. Na aba “Downloads”, baixe.",
      "Arraste o arquivo aqui embaixo, do jeito que veio.",
    ],
    link: {
      label: "Abrir a Keeta",
      href: "https://merchant.mykeeta.com/m/web/app/bizdata#/dataDownload",
    },
    video: `${TUT}keeta-baixar-dados.mp4`,
  },
}

/**
 * A segunda porta: integrar e deixar automático. O prazo é o MEDIDO, não o
 * desejado (22/09/26): no 99 as 10 últimas lojas tiveram dado em minutos
 * depois da autorização; no iFood as 5 últimas (desde 30/08) tiveram mediana
 * de 16 h — duas em minutos, a mais lenta em 3 dias. O Marcus fixou o iFood
 * em "até 24h" como compromisso do time (22/09/26): o prazo agora é META
 * nossa, não só média — cadastrar o CNPJ no portal no mesmo dia do pedido.
 */
const AUTOMATICO: Partial<Record<Plat, { prazo: string; passos: string[] }>> = {
  ifood: {
    prazo: "em até 24h",
    passos: [
      "Clique em “Integrar automaticamente” e peça a conexão — usamos o CNPJ do cadastro.",
      "Nosso time cadastra a sua loja no iFood e te avisa por e-mail.",
      "Você aprova o Delivery OS no Portal do Parceiro, em Integrações.",
      "O histórico entra sozinho e, dali em diante, todo dia — sem planilha.",
    ],
  },
  "99food": {
    prazo: "em minutos, depois que você autoriza",
    passos: [
      "Clique em “Integrar automaticamente” e depois em “Autorizar no 99”.",
      "Entre com o login de administrador principal da conta no 99 e autorize a sua loja.",
      "Volte e clique em “Já autorizei” — encontramos a sua loja na hora.",
      "Os dados começam a entrar em minutos e, dali em diante, todo dia.",
    ],
  },
}

const NOME = { ifood: "iFood", "99food": "99 Food", keeta: "Keeta" } as const

export function PrimeiroRelatorio({
  plataformas,
  conectarHref,
}: {
  /** Plataformas das lojas do cliente. Vazio = mostra as três. */
  plataformas: string[]
  /** Tela de conexão da loja (ou o cadastro, se ainda não há loja). */
  conectarHref: string
}) {
  const ordem: Plat[] = ["ifood", "99food", "keeta"]
  const disponiveis = ordem.filter(
    (p) => plataformas.length === 0 || plataformas.includes(p),
  )
  const lista = disponiveis.length > 0 ? disponiveis : ordem
  const [sel, setSel] = React.useState<Plat>(lista[0])
  const [video, setVideo] = React.useState(false)
  const p = PRIMEIRO[sel]
  const auto = AUTOMATICO[sel]

  return (
    <div className="rounded-xl border bg-card p-5">
      {lista.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Comece por:</span>
          {lista.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSel(id)}
              aria-pressed={sel === id}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                sel === id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <PlatformLogo platform={id} size="sm" />
              {NOME[id]}
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-4 ${auto ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Zap className="size-4 text-primary" />
            <p className="text-sm font-semibold">Quer ver já?</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
              hoje, em uns 10 minutos
            </span>
          </div>
          <div className="flex items-start gap-3">
            <PlatformLogo platform={sel} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Baixe o relatório{" "}
                <span className="text-primary">{p.relatorio}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Só ele já mostra: {p.mostra}
              </p>

              <ol className="mt-3 space-y-2">
                {p.passos.map((passo, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-[13px] leading-relaxed"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span>{passo}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={p.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <ExternalLink className="size-3.5" />
                  {p.link.label}
                </a>
                <button
                  type="button"
                  onClick={() => setVideo(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <Play className="size-3.5" />
                  Ver o vídeo
                </button>
              </div>
            </div>
          </div>
        </div>

        {auto && (
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Plug className="size-4 text-primary" />
              <p className="text-sm font-semibold">
                Quero integrar minha loja automaticamente
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Prazo médio:{" "}
              <b className="font-semibold text-foreground">{auto.prazo}</b>
            </p>
            <ol className="mt-3 space-y-2">
              {auto.passos.map((passo, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 text-[13px] leading-relaxed"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
            <Link
              href={conectarHref}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              <Plug className="size-3.5" />
              Integrar automaticamente
            </Link>
          </div>
        )}
      </div>
      {auto && (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Dá pra fazer os dois: o relatório mostra seus números hoje, e a
          integração passa a atualizar tudo sozinha quando ficar pronta.
        </p>
      )}

      {video && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setVideo(false)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <p className="text-sm font-medium">
                {NOME[sel]} · {p.relatorio}
              </p>
              <button
                type="button"
                onClick={() => setVideo(false)}
                aria-label="Fechar"
                className="rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <video
              src={p.video}
              controls
              autoPlay
              className="max-h-[80vh] w-full rounded-lg bg-black"
            />
          </div>
        </div>
      )}
    </div>
  )
}
