"use client"

/**
 * Barra de progresso global no topo (estilo GitHub/YouTube).
 *
 * Problema que resolve: quando um controle muda só o searchParam (ex.: trocar o
 * período no Ranking), o Next re-renderiza no servidor e MANTÉM a tela antiga
 * até terminar — dá impressão de travado. O `loading.tsx` não dispara nesse caso
 * (mesma rota). Então damos feedback client-side: os controles chamam `navigate()`
 * daqui em vez de `router.push`, ligando a barra; ela apaga quando a URL muda
 * (navegação concluída).
 */
import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type Ctx = {
  navigating: boolean
  navigate: (url: string) => void
  /** Liga a barra sem navegar (pra quem já faz router.push por conta própria). */
  start: () => void
}

const NavContext = React.createContext<Ctx | null>(null)

export function NavigationProgress({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [navigating, setNavigating] = React.useState(false)

  // Chave da rota atual: muda quando a navegação efetivamente conclui.
  const key = `${pathname}?${searchParams.toString()}`
  const lastKey = React.useRef(key)
  const safety = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key
      setNavigating(false)
      if (safety.current) clearTimeout(safety.current)
    }
  }, [key])

  const start = React.useCallback(() => {
    setNavigating(true)
    if (safety.current) clearTimeout(safety.current)
    // Trava de segurança: se algo der errado, some sozinha em 20s.
    safety.current = setTimeout(() => setNavigating(false), 20000)
  }, [])

  // Interceptador GLOBAL: qualquer clique num link interno que troca de tela
  // liga a barra — cobre menu lateral, cards, linhas-link etc. em TODA tela,
  // sem precisar tocar em cada componente. Os controles que navegam via
  // router.push continuam usando navigate()/start().
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ignora clique com modificador (abrir em nova aba), botão do meio/direito.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return
      const anchor = (e.target as HTMLElement | null)?.closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return // link externo
      // Mesma tela (só âncora/hash ou URL idêntica) → não é navegação.
      const alvo = url.pathname + url.search
      const atual = window.location.pathname + window.location.search
      if (alvo === atual) return
      start()
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [start])

  const navigate = React.useCallback(
    (url: string) => {
      start()
      router.push(url)
    },
    [router, start],
  )

  return (
    <NavContext.Provider value={{ navigating, navigate, start }}>
      <ProgressBar navigating={navigating} />
      {children}
    </NavContext.Provider>
  )
}

/** Barra "creeping" (vai até 90% e completa quando termina). */
function ProgressBar({ navigating }: { navigating: boolean }) {
  const [visible, setVisible] = React.useState(false)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    if (navigating) {
      setVisible(true)
      setWidth(0)
      // dois rAFs pra garantir a transição do 0 → 90%
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setWidth(90))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    }
    // terminou: completa e some
    setWidth(100)
    const t = setTimeout(() => {
      setVisible(false)
      setWidth(0)
    }, 280)
    return () => clearTimeout(t)
  }, [navigating])

  return (
    <div
      aria-hidden
      data-print="hide"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px] shadow-primary/50"
        style={{
          width: `${width}%`,
          transition: navigating
            ? "width 8s cubic-bezier(0.1,0.7,0.1,1)"
            : "width 0.2s ease",
        }}
      />
    </div>
  )
}

/** Navega ligando a barra de progresso global. Use no lugar de `router.push`. */
export function useNavigate(): (url: string) => void {
  const ctx = React.useContext(NavContext)
  const router = useRouter()
  // Fallback: se não estiver dentro do provider, navega normal.
  return ctx?.navigate ?? ((url: string) => router.push(url))
}

/** Liga a barra sem navegar (pra controles que já chamam router por conta). */
export function useNavStart(): () => void {
  const ctx = React.useContext(NavContext)
  return ctx?.start ?? (() => {})
}
