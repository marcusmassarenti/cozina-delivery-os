"use client"

import { AlertTriangle, CircleCheck, Download, Info } from "lucide-react"
import Link from "next/link"

import { LojasSemDadoAviso } from "@/components/dashboard/lojas-sem-dado-aviso"
import type { LojaSemDado } from "@/lib/data/lojas-sem-dado"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ImportCoverage, PlatformCoverage } from "@/lib/data/relatorio-diario"
import { nowParts } from "@/lib/period"

import { Ninefood99QuickSync } from "./ninefood99-quick-sync"
import { SyncIfoodButton } from "./sync-ifood-button"

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

/** Quantos dias atrás do alvo é considerado atrasado (D-1 + 2 dias de folga). */
const ATRASO_TOLERANCIA_DIAS = 2

function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/**
 * Banner de cobertura de importação no Dashboard. Mostra, por plataforma, até
 * que dia tem dado no mês. Cada plataforma é julgada contra um ALVO ABSOLUTO
 * de frescor (último dia do mês OU ontem, o que for menor) — não comparando as
 * plataformas entre si. Atrasado = dado mais de 2 dias atrás do alvo.
 *
 * Só aparecem as plataformas HABILITADAS no tenant (`platformsEnabled`). Os
 * botões "Sincronizar iFood/99" (sync via API) só aparecem quando `apiSync`
 * está ligado — pra SaaS que só importa manual, ficam ocultos.
 */
export function ImportCoverageBanner({
  coverage,
  year,
  month,
  periodLabel,
  platformsEnabled,
  apiSync = false,
  vinculos,
  semDado,
}: {
  coverage: ImportCoverage
  year: number
  month: number
  periodLabel: string
  /** Plataformas habilitadas no tenant (união de unit_platforms.active). Se
   *  omitido, mostra as 3 (compat). */
  platformsEnabled?: PlatformId[]
  /** Liga os botões de sync via API (só pra quem tem a integração habilitada). */
  apiSync?: boolean
  /** Quais plataformas têm ≥1 loja VINCULADA à API no escopo do usuário —
   *  o botão de cada plataforma só aparece com vínculo de verdade (Marcus:
   *  "o botão só deve aparecer quando pelo menos 1 loja tem vínculo").
   *  Omitido = compat (mostra pelos critérios antigos). */
  vinculos?: { ifood: boolean; ninefood: boolean }
  /** Lojas que declararam plataforma e nunca importaram nada. */
  semDado?: LojaSemDado[]
}) {
  // Alvo: menor entre fim do mês e ontem (D-1). "Ontem" é calculado em horário
  // de Brasília — senão, na Vercel (UTC), depois das 21h o D-1 pula um dia.
  const monthEnd = new Date(year, month, 0)
  const today = nowParts()
  const yesterday = new Date(today.year, today.month - 1, today.day - 1)
  const target = yesterday < monthEnd ? yesterday : monthEnd

  const lagDays = (cov: PlatformCoverage): number | null => {
    if (!cov.lastDate) return null
    return Math.max(
      0,
      Math.round((target.getTime() - parseYmd(cov.lastDate).getTime()) / 86_400_000),
    )
  }
  const isBehind = (cov: PlatformCoverage) => {
    const lag = lagDays(cov)
    return lag !== null && lag > ATRASO_TOLERANCIA_DIAS
  }

  const platforms: { id: PlatformId; cov: PlatformCoverage }[] = (
    [
      { id: "ifood", cov: coverage.ifood },
      { id: "99food", cov: coverage.ninefood },
      { id: "keeta", cov: coverage.keeta },
      // Canal próprio entra na barra como as outras: cliente que só vende no
      // Cardápio Web via "falta importar" pra sempre, sem nada a importar.
      { id: "cardapioweb", cov: coverage.cardapioweb },
    ] as { id: PlatformId; cov: PlatformCoverage }[]
  ).filter((p) => !platformsEnabled || platformsEnabled.includes(p.id))
  const withData = platforms.filter((p) => p.cov.lastDay !== null)
  const noData = withData.length === 0
  const anyBehind = platforms.some((p) => isBehind(p.cov))
  /* Sem dado é uma coisa; sem dado E SEM CONEXÃO é outra.
   *
   * Loja recém-conectada por API não tem dado até o 1º sync rodar — e a faixa
   * mandava o cliente "subir os relatórios em /importacao" numa loja que ia se
   * preencher sozinha. Aconteceu com a Vbfood em 07/ago/26: conectada de
   * manhã, e o painel dela pedindo planilha à tarde.
   *
   * `vinculos` já diz quais plataformas têm ≥1 loja ligada de verdade. */
  const conectada = (id: PlatformId) =>
    id === "ifood"
      ? Boolean(vinculos?.ifood)
      : id === "99food"
        ? Boolean(vinculos?.ninefood)
        : false
  const semDadoNenhum = platforms.filter((p) => p.cov.lastDay === null)
  const faltantes = semDadoNenhum
    .filter((p) => !conectada(p.id))
    .map((p) => PLAT_LABEL[p.id])
  // Plataforma conectada e sem dado NÃO vira aviso de texto: o botão
  // "Sincronizar" logo abaixo é a ação certa — o cliente clica e puxa agora,
  // em vez de ler que está esperando.

  const tone = noData
    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
    : anyBehind
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"

  return (
    <TooltipProvider delay={150}>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-xs ${tone}`}
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {noData || anyBehind ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <CircleCheck className="size-3.5" />
          )}
          Cobertura de importação · {periodLabel}
        </span>

        {/* Mês corrente: explica no hover por que o portal (ao vivo) pode
            mostrar um pouco mais que o sistema. */}
        {year === nowParts().year && month === nowParts().month && (
          <span
            title={
              "Comparando com o portal? O portal do iFood mostra as vendas AO VIVO; aqui entra a conciliação financeira, que fecha com algumas horas de defasagem — por isso no mês em aberto o portal pode aparecer um pouco maior. Quando o mês fecha, os números batem ao centavo. Clique em Sincronizar (ou aguarde a sync diária) pra puxar os dias mais recentes."
            }
            className="inline-flex cursor-help items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-80"
          >
            <Info className="size-3" />
            mês em aberto
          </span>
        )}

        {noData ? (
          <span>nenhum dado importado neste mês — suba os relatórios em /importacao</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {platforms.map((p) => {
              const behind = isBehind(p.cov)
              const lag = lagDays(p.cov)
              const semDados = p.cov.lastDay === null
              const ateLabel = semDados
                ? "sem dados"
                : `até ${String(p.cov.lastDay).padStart(2, "0")}/${MES_ABREV[month - 1]}`

              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger
                    render={
                      <span
                        className={`inline-flex cursor-default items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium ${
                          behind
                            ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                            : "border-border text-foreground"
                        }`}
                      >
                        <PlatformLogo platform={p.id} size="sm" />
                        {ateLabel}
                        {behind && (
                          <AlertTriangle className="size-3 text-amber-600" />
                        )}
                      </span>
                    }
                  />
                  <TooltipContent className="max-w-[18rem] text-left">
                    <PillTooltip
                      platform={p.id}
                      semDados={semDados}
                      behind={behind}
                      lag={lag}
                    />
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}

        {faltantes.length > 0 ? (
          <Link
            href="/importacao"
            title="Baixe e importe os relatórios faltantes"
            className="inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-card/60"
          >
            <Download className="size-3" />
            Falta importar: {faltantes.join(", ")}
          </Link>
        ) : null}


        {/* Sync via API — cada botão só aparece se o tenant tem a integração
            habilitada E pelo menos 1 loja VINCULADA àquela plataforma. SaaS
            que só importa manual (ou ainda sem vínculo) não vê. */}
        {apiSync && (
          <div className="ml-auto flex items-center gap-1.5">
            {(!platformsEnabled || platformsEnabled.includes("ifood")) &&
              (vinculos?.ifood ?? true) && <SyncIfoodButton />}
            {(!platformsEnabled || platformsEnabled.includes("99food")) &&
              (vinculos?.ninefood ?? true) && (
                <Ninefood99QuickSync year={year} month={month} />
              )}
          </div>
        )}
        {/* Cinza, dentro da faixa que já responde "o que falta?". Sem ícone e
            sem vermelho de propósito: isto está assim há meses e vai continuar
            amanhã — aviso permanente pintado de urgente é como se aprende a
            ignorar os avisos que importam. */}
        {semDado && semDado.length > 0 && (
          <div className="basis-full">
            <LojasSemDadoAviso lojas={semDado} />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

/** Texto do tooltip de cada pílula — explica o status e o porquê do alerta. */
function PillTooltip({
  platform,
  semDados,
  behind,
  lag,
}: {
  platform: PlatformId
  semDados: boolean
  behind: boolean
  lag: number | null
}) {
  if (semDados) {
    return (
      <span>
        Sem dados de <b>{PLAT_LABEL[platform]}</b> neste mês — importe o relatório
        em /importacao.
      </span>
    )
  }

  if (platform === "ifood") {
    // O iFood publica o financeiro em ciclos SEMANAIS (vira lançamento ~7 dias
    // depois da venda). Por isso a pílula mede o FINANCEIRO (que alimenta a DRE)
    // e fica naturalmente atrás das vendas e das outras plataformas.
    return (
      <span>
        {behind ? (
          <>
            <b>Por que o alerta:</b> o iFood publica o <b>financeiro</b> em ciclos
            semanais, com defasagem de ~7 dias.{" "}
          </>
        ) : (
          <b>Financeiro em dia. </b>
        )}
        Esta pílula mede a conciliação financeira (a que alimenta a DRE) — não o
        Relatório de Vendas, que costuma estar mais à frente. Não é erro de
        importação.
      </span>
    )
  }

  if (behind) {
    return (
      <span>
        <b>{PLAT_LABEL[platform]}</b> está atrasado{" "}
        {lag != null ? `${lag} dia${lag === 1 ? "" : "s"}` : ""} em relação a
        ontem. Sincronize ou importe o relatório mais recente.
      </span>
    )
  }
  return (
    <span>
      <b>{PLAT_LABEL[platform]}</b> em dia.
    </span>
  )
}
