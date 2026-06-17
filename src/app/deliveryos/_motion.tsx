"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

/**
 * Revela o conteúdo com fade + slide-up quando entra na viewport.
 * `delay` (ms) permite escalonar (stagger) vários filhos.
 */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transition: `opacity .75s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .75s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Número formatado em pt-BR. Estático de propósito — o valor final aparece
 * direto (sem contar do zero), só com o fade do <Reveal> na entrada. Marcus
 * achou o count-up confuso: os valores intermediários pareciam métricas reais.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  to: number
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const formatted = to.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

/** true quando a página rolou além de `threshold` px (pra nav sticky reagir). */
export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [threshold])
  return scrolled
}

/** Deslocamento de parallax suave (px) conforme rola — pro mock do hero flutuar. */
export function useParallax(factor = 0.08, max = 60) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const y = Math.min(max, window.scrollY * factor)
      setOffset(y)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [factor, max])
  return offset
}
