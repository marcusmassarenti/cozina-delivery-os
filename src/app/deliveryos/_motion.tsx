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
  imediato = false,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  style?: CSSProperties
  /**
   * ACIMA DA DOBRA, USE ISTO.
   *
   * O Reveal normal nasce com `opacity: 0` e só acende depois de baixar o JS,
   * hidratar, o IntersectionObserver disparar e a transição de 0,75s rodar.
   * Isso é certo pra quem ROLA até a seção — e desastroso pro que já está na
   * tela: em 19/08/26 o HTML da landing saía com 73 elementos invisíveis,
   * incluindo o <h1> e o print do herói. O visitante ficava olhando um fundo
   * escuro vazio até 244 KB de JS terminarem de carregar, e era isso que
   * segurava o LCP e o Speed Index do PageSpeed.
   *
   * Com `imediato`, o conteúdo é PINTADO JÁ VISÍVEL — a opacidade nunca é
   * tocada — e a entrada acontece só no `transform`, por CSS puro. O
   * movimento continua lá, mas nada do que o navegador precisa medir depende
   * de JavaScript.
   */
  imediato?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (imediato) return
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
  }, [imediato])

  if (imediato) {
    return (
      <div
        className={className}
        style={{
          // `subir` mexe só no transform. Se o CSS não carregar ou o usuário
          // pedir menos movimento, o conteúdo já está no lugar certo e opaco.
          animation: `subir .75s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
          ["--subir-y" as string]: `${y}px`,
          ...style,
        }}
      >
        {children}
      </div>
    )
  }

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
