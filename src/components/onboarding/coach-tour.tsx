"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, X } from "lucide-react"

const BRAND = "oklch(0.65 0.21 35)"

export type CoachStep = {
  /** CSS selector do elemento a destacar (ex.: '[data-tour="dropzone"]'). */
  selector: string
  title: string
  body: string
  icon?: React.ReactNode
}

/**
 * Tour "coach-mark": escurece a tela, destaca o elemento do passo (spotlight)
 * e mostra um balão explicando. Navega com Próxima/Voltar. Se o elemento não
 * existir, centraliza o balão. Chama onClose ao pular ou terminar.
 */
export function CoachTour({
  steps,
  open,
  onClose,
}: {
  steps: CoachStep[]
  open: boolean
  onClose: () => void
}) {
  const [i, setI] = React.useState(0)
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [mounted, setMounted] = React.useState(false)
  const uid = React.useId()
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    if (open) setI(0)
  }, [open])

  // Só UM tour por vez: ao abrir, avisa os outros; quem estiver aberto fecha.
  React.useEffect(() => {
    if (!open) return
    window.dispatchEvent(new CustomEvent("cozina:coach-open", { detail: uid }))
  }, [open, uid])
  React.useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== uid) onCloseRef.current()
    }
    window.addEventListener("cozina:coach-open", onOther as EventListener)
    return () =>
      window.removeEventListener("cozina:coach-open", onOther as EventListener)
  }, [uid])

  React.useEffect(() => {
    if (!open) return
    const step = steps[i]
    if (!step) return

    const measure = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null
      setRect(el ? el.getBoundingClientRect() : null)
    }

    const el = document.querySelector(step.selector) as HTMLElement | null
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })

    // Mede depois do scroll assentar + de novo no frame seguinte.
    const t = setTimeout(measure, 380)
    const t2 = setTimeout(measure, 700)
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [open, i, steps])

  if (!open || !mounted) return null

  const step = steps[i]
  const total = steps.length
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tipW = Math.min(360, vw - 24)

  let tipTop: number
  let tipLeft: number
  if (rect) {
    const spaceBelow = vh - rect.bottom
    tipTop = spaceBelow > 250 ? rect.bottom + 14 : Math.max(12, rect.top - 234)
    tipLeft = Math.min(Math.max(12, rect.left), vw - tipW - 12)
  } else {
    tipTop = vh / 2 - 120
    tipLeft = vw / 2 - tipW / 2
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
      {rect ? (
        <div
          style={{
            position: "fixed",
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: `2px solid ${BRAND}`,
            transition: "all .25s ease",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      )}

      <div
        style={{ position: "fixed", top: tipTop, left: tipLeft, width: tipW, pointerEvents: "auto" }}
        className="rounded-xl border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: BRAND }}
          >
            Passo {i + 1} de {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[15px] font-semibold">
          {step.icon}
          {step.title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Pular
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                aria-label="Voltar"
                className="rounded-md border p-1.5 transition-colors hover:bg-muted"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => (i < total - 1 ? setI(i + 1) : onClose())}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
              style={{ background: BRAND }}
            >
              {i < total - 1 ? "Próxima" : "Entendi"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
