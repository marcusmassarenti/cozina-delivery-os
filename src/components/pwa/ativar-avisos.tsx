"use client"

import * as React from "react"
import { Bell, BellOff } from "lucide-react"

import {
  salvarAssinaturaPush,
  removerAssinaturaPush,
} from "@/app/(app)/_actions-push"

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** base64url -> Uint8Array, formato que o navegador exige na inscricao. */
function chaveBinaria(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  // ArrayBuffer, não Uint8Array: o tipo de `applicationServerKey` exige um
  // buffer de tamanho fixo, e Uint8Array genérico não satisfaz.
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

/**
 * Liga/desliga os avisos no aparelho atual.
 *
 * NAO pede permissao sozinho ao abrir a tela. Navegador bloqueia
 * permanentemente quem pede sem contexto, e uma recusa dessas nao tem volta
 * pelo app — a pessoa teria que ir nas configuracoes do sistema. So pede
 * depois do clique, que e quando ela entendeu o que esta aceitando.
 *
 * No iPhone so funciona com o site adicionado a tela de inicio. Fora disso a
 * API nem existe, e o componente diz isso em vez de oferecer um botao morto.
 */
export function AtivarAvisos() {
  const [estado, setEstado] = React.useState<
    "carregando" | "indisponivel" | "precisa-instalar" | "ligado" | "desligado" | "negado"
  >("carregando")
  const [msg, setMsg] = React.useState<string | null>(null)
  const [ocupado, setOcupado] = React.useState(false)

  React.useEffect(() => {
    void (async () => {
      const temApi = "serviceWorker" in navigator && "PushManager" in window
      if (!temApi) {
        const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        setEstado(iOS ? "precisa-instalar" : "indisponivel")
        return
      }
      if (Notification.permission === "denied") return setEstado("negado")
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub ? "ligado" : "desligado")
    })()
  }, [])

  async function ligar() {
    if (!VAPID) {
      setMsg("Avisos ainda nao configurados no servidor.")
      return
    }
    setOcupado(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "negado" : "desligado")
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
      setMsg(r.message ?? null)
      if (r.ok) setEstado("ligado")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Nao consegui ativar.")
    } finally {
      setOcupado(false)
    }
  }

  async function desligar() {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await removerAssinaturaPush(sub.endpoint)
        await sub.unsubscribe()
      }
      setEstado("desligado")
      setMsg("Avisos desligados neste aparelho.")
    } finally {
      setOcupado(false)
    }
  }

  if (estado === "carregando" || estado === "indisponivel") return null

  return (
    <div className="rounded-lg border bg-card px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {estado === "ligado" ? (
          <Bell className="size-4 text-emerald-600" />
        ) : (
          <BellOff className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium">Avisos no celular</span>

        {estado === "precisa-instalar" && (
          <span className="text-muted-foreground">
            no iPhone, adicione o Delivery OS a tela de inicio pelo botao de
            compartilhar — os avisos so funcionam a partir dali
          </span>
        )}
        {estado === "negado" && (
          <span className="text-muted-foreground">
            bloqueado nas configuracoes do aparelho — libere por la e recarregue
          </span>
        )}
        {estado === "desligado" && (
          <button
            type="button"
            onClick={ligar}
            disabled={ocupado}
            className="ml-auto rounded-md border px-2.5 py-1 font-semibold transition-colors hover:bg-muted disabled:opacity-50"
          >
            {ocupado ? "ativando..." : "Ativar"}
          </button>
        )}
        {estado === "ligado" && (
          <button
            type="button"
            onClick={desligar}
            disabled={ocupado}
            className="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            desligar neste aparelho
          </button>
        )}
      </div>
      {msg && <p className="mt-1.5 text-muted-foreground">{msg}</p>}
    </div>
  )
}
