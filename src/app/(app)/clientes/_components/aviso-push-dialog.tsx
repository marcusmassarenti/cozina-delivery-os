"use client"

import * as React from "react"
import { Bell, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  contarAparelhosPush,
  enviarAvisoPush,
  type AvisoPushState,
} from "../_actions"

const inicial: AvisoPushState = { ok: false }

/**
 * Manda um aviso por push pro cliente.
 *
 * Antes disto, o único jeito de falar por push com um cliente era pedir pra
 * alguém rodar um script. E o push só saía sozinho no resumo semanal.
 *
 * A CONTAGEM é o ponto da tela, não o formulário. Em 03/ago/26 o Marcus pediu
 * um aviso pra um cliente que usava o app todo dia; o sistema inteiro tinha UMA
 * assinatura (a do teste interno) e o envio teria devolvido "0 enviados" em
 * silêncio. Push não avisa quando não chega em ninguém — ver o número antes de
 * clicar é a única defesa, e por isso ele fica ao lado do botão, não escondido.
 *
 * Também não tem desfazer: uma vez tocado, tocou. Daí a confirmação com o texto
 * na tela em vez de enviar no primeiro clique.
 */
export function AvisoPushDialog({
  holdingId,
  holdingName,
}: {
  holdingId: string
  holdingName: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const [estado, action] = React.useActionState(enviarAvisoPush, inicial)
  const [alcance, setAlcance] = React.useState<{
    aparelhos: number
    pessoas: number
  } | null>(null)
  const [titulo, setTitulo] = React.useState("")
  const [corpo, setCorpo] = React.useState("")
  const [confirmando, setConfirmando] = React.useState(false)

  // Abrir/fechar faz o trabalho, não um efeito: `setState` síncrono dentro de
  // useEffect dispara render em cascata (regra nova do React 19, e o lint pega).
  function abrirFechar(v: boolean) {
    setAberto(v)
    setConfirmando(false)
    if (v) {
      setAlcance(null)
      void contarAparelhosPush(holdingId).then(setAlcance)
    } else {
      // Limpa ao fechar pra não reenviar o mesmo texto sem querer depois.
      setTitulo("")
      setCorpo("")
    }
  }

  const semAparelho = alcance?.aparelhos === 0
  const podeEnviar = titulo.trim().length >= 3 && corpo.trim().length >= 5

  return (
    <Dialog open={aberto} onOpenChange={abrirFechar}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Bell className="size-3.5" />
            Enviar aviso
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base">Enviar aviso</DialogTitle>
        <DialogDescription className="text-xs">
          Notificação no celular de {holdingName}.
        </DialogDescription>

        {/* Alcance PRIMEIRO: se é zero, o resto do formulário não importa. */}
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            semAparelho
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
              : "bg-muted/40 text-muted-foreground"
          }`}
        >
          {alcance === null ? (
            "Conferindo quantos aparelhos vão receber…"
          ) : semAparelho ? (
            <>
              <strong>Ninguém vai receber.</strong> Nenhuma pessoa desse cliente
              ativou os avisos. Elas precisam abrir o app e aceitar na faixa do
              painel — até lá, o envio não chega em lugar nenhum.
            </>
          ) : (
            <>
              Vai para <strong>{alcance.aparelhos} aparelho(s)</strong> de{" "}
              {alcance.pessoas} pessoa(s).
            </>
          )}
        </div>

        <form action={action} className="mt-3 flex flex-col gap-2.5">
          <input type="hidden" name="holdingId" value={holdingId} />
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Título
            </label>
            <input
              name="titulo"
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value)
                setConfirmando(false)
              }}
              maxLength={60}
              placeholder="Suas lojas já estão conectadas"
              className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Mensagem
            </label>
            <textarea
              name="corpo"
              value={corpo}
              onChange={(e) => {
                setCorpo(e.target.value)
                setConfirmando(false)
              }}
              maxLength={160}
              rows={3}
              placeholder="O que a pessoa vê na notificação."
              className="mt-1 w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
              {corpo.length}/160
            </p>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Toque leva para
            </label>
            <select
              name="url"
              defaultValue="/inicio"
              className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            >
              <option value="/inicio">Dashboard</option>
              <option value="/importacao">Importação</option>
              <option value="/financeiro">Financeiro</option>
              <option value="/novidades">Novidades</option>
            </select>
          </div>

          {estado.ok ? (
            // Enviado: some com o botão pra não disparar duas vezes no impulso.
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                {estado.message}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1.5 h-7 text-xs"
                onClick={() => abrirFechar(false)}
              >
                Fechar
              </Button>
            </div>
          ) : confirmando ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="text-[11px] text-rose-800 dark:text-rose-300">
                Confirma? Notificação enviada <strong>não tem volta</strong> —
                não dá pra apagar do celular de ninguém.
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="submit" size="sm" className="h-7 gap-1.5 text-xs">
                  <Send className="size-3" />
                  Enviar agora
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmando(false)}
                >
                  Revisar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!podeEnviar || semAparelho}
              onClick={() => setConfirmando(true)}
              className="h-8 gap-1.5 self-start text-xs"
            >
              <Send className="size-3.5" />
              Revisar e enviar
            </Button>
          )}

          {!estado.ok && estado.message && (
            <p className="text-[11px] text-rose-600">{estado.message}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
