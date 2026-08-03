"use client"

import * as React from "react"
import { Bell, X } from "lucide-react"

import { salvarAssinaturaPush } from "@/app/(app)/_actions-push"

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const DISPENSADO = "cz-avisos-convite-dispensado"

function chaveBinaria(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

/**
 * Convite pra ligar os avisos, no dashboard.
 *
 * O controle sempre existiu, mas só em Minha conta → Informações — e ninguém
 * tem motivo pra passar por lá. Resultado medido em 03/ago/26: os 4 usuários da
 * DG Foods usaram o app no mesmo dia e havia ZERO assinaturas de push no
 * sistema inteiro (uma, do teste interno). Não era falha técnica: a porta
 * estava escondida. Qualquer mensagem programada iria pra ninguém.
 *
 * Aparece onde a pessoa já está, uma vez. Some sozinho quando ela liga, e
 * dispensa PRA SEMPRE se ela fechar — insistir com quem já disse não é o jeito
 * mais rápido de virar ruído.
 *
 * NÃO pede permissão ao renderizar: navegador bloqueia permanentemente quem
 * pede sem contexto, e recusa dessas não tem volta pelo app. Só depois do
 * clique, que é quando a pessoa entendeu o que está aceitando.
 */
export function AvisosConvite() {
  const [estado, setEstado] = React.useState<
    "carregando" | "esconder" | "oferecer" | "precisa-instalar" | "ligado"
  >("carregando")
  const [ocupado, setOcupado] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  React.useEffect(() => {
    void (async () => {
      if (localStorage.getItem(DISPENSADO) === "1") return setEstado("esconder")
      if (!VAPID) return setEstado("esconder")

      const temApi = "serviceWorker" in navigator && "PushManager" in window
      if (!temApi) {
        // No iPhone a API só existe com o site na tela de início. Aqui vale
        // explicar: o cliente instalou o app e mesmo assim não recebia nada.
        const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        return setEstado(iOS ? "precisa-instalar" : "esconder")
      }
      if (Notification.permission === "denied") return setEstado("esconder")

      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub ? "esconder" : "oferecer")
    })()
  }, [])

  function dispensar() {
    localStorage.setItem(DISPENSADO, "1")
    setEstado("esconder")
  }

  async function ligar() {
    if (!VAPID) return
    setOcupado(true)
    setErro(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        // Negou: não insiste nunca mais. O navegador não deixa perguntar de
        // novo mesmo, e a faixa ficaria ali sem servir pra nada.
        if (perm === "denied") dispensar()
        return
      }
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveBinaria(VAPID),
      })
      const j = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      const r = await salvarAssinaturaPush({
        endpoint: sub.endpoint,
        p256dh: j.keys?.p256dh ?? "",
        auth: j.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      })
      if (r.ok) setEstado("ligado")
      else setErro(r.message ?? "Não consegui ativar agora.")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ativar agora.")
    } finally {
      setOcupado(false)
    }
  }

  if (estado === "carregando" || estado === "esconder") return null

  if (estado === "ligado") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
        <Bell className="size-4 shrink-0" />
        <span>
          Pronto — você recebe um aviso quando o financeiro atualizar. Dá pra
          desligar em Minha conta.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3">
      <Bell className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {estado === "precisa-instalar" ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Quer receber avisos no celular?
            </span>{" "}
            No iPhone, toque em Compartilhar e depois em{" "}
            <span className="font-medium text-foreground">
              Adicionar à Tela de Início
            </span>
            . Abra por lá e o botão de ativar aparece aqui.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Quer saber quando o financeiro atualizar?
            </span>{" "}
            Ative os avisos e a gente te chama quando os números do dia
            entrarem — sem precisar abrir o app pra conferir.
          </p>
        )}
        {erro && <p className="mt-1 text-[11px] text-rose-600">{erro}</p>}
      </div>

      {estado === "oferecer" && (
        <button
          type="button"
          onClick={ligar}
          disabled={ocupado}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {ocupado ? "Ativando…" : "Ativar avisos"}
        </button>
      )}
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
