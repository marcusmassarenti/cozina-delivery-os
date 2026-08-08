"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, HelpCircle, Loader2, X } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { AvisoSemanalSaude } from "@/lib/data/aviso-semanal-saude"
import { marcarAvisoSaudeVisto } from "@/components/saude-semanal-actions"

/** Quantas lojas aparecem com nome antes de virar "+N outras". */
const TETO = 4

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Aviso semanal de saúde das lojas — o que o cliente vê ao entrar na segunda.
 *
 * ⚠️ ESTE POP-UP CONTRARIA UMA DECISÃO ANTERIOR, e de propósito. O aviso das
 * lojas sem dado já existia discreto, em cinza, dentro da faixa de cobertura,
 * com a justificativa de que "aviso permanente pintado de urgente é como se
 * aprende a ignorar os avisos que importam". O raciocínio continua certo — o
 * que mudou é o resultado: o cliente não estava agindo, então o aviso
 * discreto não estava informando ninguém.
 *
 * O acordo entre as duas coisas é a CADÊNCIA: uma vez por semana, na segunda.
 * Interrompe o suficiente pra ser visto e raro o suficiente pra não virar
 * paisagem. Fechou, não volta até a semana seguinte (`profiles`, não
 * localStorage — senão voltaria no celular depois de fechado no desktop).
 *
 * E ele não chuta a causa do "nunca recebeu dado": pergunta. O sistema
 * consegue afirmar que a loja está conectada e não trouxe dado, mas não
 * consegue saber se a Keeta marcada no cadastro é planilha atrasada ou loja
 * que nunca vendeu na Keeta. Quem sabe é o dono.
 */
export function SaudeSemanalModal({ aviso }: { aviso: AvisoSemanalSaude | null }) {
  const [fechado, setFechado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  if (!aviso || aviso.vazio || fechado) return null

  function fechar() {
    setFechado(true) // some na hora; o registro vai atrás
    setSalvando(true)
    void marcarAvisoSaudeVisto(aviso!.semana).finally(() => setSalvando(false))
  }

  const lojas = aviso.precisamAtencao
  const mostra = lojas.slice(0, TETO)
  const resto = lojas.length - mostra.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saude-semanal-titulo"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-background shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <h2 id="saude-semanal-titulo" className="text-lg font-semibold leading-tight">
                Seus dados desta semana
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Uma vez por semana a gente confere se todas as suas lojas estão
                mandando dados.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {salvando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
          </button>
        </div>

        <div className="space-y-4 p-5">
          {lojas.length > 0 && (
            <section>
              <p className="text-sm font-semibold">
                {lojas.length}{" "}
                {lojas.length === 1 ? "loja precisa" : "lojas precisam"} de atenção
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                O faturamento desses dias não está entrando nos seus relatórios.
              </p>
              <div className="mt-2.5 space-y-1.5">
                {mostra.map((l) => (
                  <div
                    key={l.unitId}
                    className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2"
                  >
                    <span className="mt-0.5 flex shrink-0 gap-1">
                      {l.plataformas.map((p) => (
                        <PlatformLogo
                          key={p}
                          platform={p as PlatformId}
                          size="sm"
                          className="size-4"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{l.loja}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {l.tipo === "financeiro"
                          ? `— vendendo, mas o faturamento parou em ${l.ultimoFinanceiro ? dm(l.ultimoFinanceiro) : "—"}`
                          : l.desde
                            ? `— sem dado desde ${dm(l.desde)}`
                            : "— sem dado"}
                      </span>
                    </span>
                  </div>
                ))}
                {resto > 0 && (
                  <p className="pl-1 text-xs text-muted-foreground">
                    e mais {resto} {resto === 1 ? "loja" : "lojas"}.
                  </p>
                )}
              </div>
            </section>
          )}

          {aviso.semDadoNunca > 0 && (
            <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-300">
                <HelpCircle className="size-4 shrink-0" />
                {aviso.semDadoNunca}{" "}
                {aviso.semDadoNunca === 1 ? "plataforma marcada" : "plataformas marcadas"}{" "}
                sem nenhum dado
              </p>
              {/* A pergunta é honesta: o sistema não tem como saber a resposta,
                  e chutar "você esqueceu de importar" ofende metade dos casos. */}
              <p className="mt-1 text-xs leading-relaxed text-sky-900/80 dark:text-sky-300/80">
                Em {aviso.semDadoLojas} {aviso.semDadoLojas === 1 ? "loja" : "lojas"} do
                seu cadastro. Isso costuma ser uma de duas coisas, e só você sabe qual:
                <strong> falta importar</strong> o relatório dessa plataforma, ou ela foi
                marcada no cadastro e a loja <strong>nunca vendeu por ali</strong>.
              </p>
              <p className="mt-2 text-xs text-sky-900/80 dark:text-sky-300/80">
                No painel, cada uma tem o botão <em>“não vendo nessa plataforma”</em> —
                marcar isso limpa o aviso e para de cobrar o dado.
              </p>
            </section>
          )}

          {aviso.aguardandoPrimeiraCarga > 0 && (
            <p className="text-xs text-muted-foreground">
              Outras {aviso.aguardandoPrimeiraCarga} já estão conectadas e a primeira
              carga ainda está vindo — essas não precisam de nada da sua parte.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={fechar}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Depois
          </button>
          <Link
            href="/importacao"
            onClick={fechar}
            className="rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Resolver agora
          </Link>
        </div>
      </div>
    </div>
  )
}
