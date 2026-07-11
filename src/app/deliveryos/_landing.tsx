"use client"

import { useEffect, useState } from "react"
import Lenis from "lenis"
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  Coins,
  CreditCard,
  EyeOff,
  FileSpreadsheet,
  FileUp,
  Gauge,
  HelpCircle,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  Mail,
  Network,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Tags,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { ExperimenteDemo } from "./_demo"
import { CountUp, Reveal, useScrolled } from "./_motion"
import {
  CaixaCarousel,
  PainBreakdown,
  PlatLogo,
  type PlatId,
} from "./_screens"

const STYLES = `
.dos-root{--brand:oklch(0.65 0.21 35);--brand-strong:oklch(0.57 0.2 33);--ink:oklch(0.2 0.01 48);--ink2:oklch(0.27 0.014 48);--cream:oklch(0.99 0.005 75);--brand-soft:oklch(0.96 0.035 55);color:oklch(0.22 0.01 48);background-color:var(--cream);background-image:radial-gradient(oklch(0.65 0.21 35/.045) 1px,transparent 1px);background-size:24px 24px;}
.dos-root *{box-sizing:border-box;}
html.lenis,html.lenis body{height:auto;}
.lenis.lenis-smooth{scroll-behavior:auto!important;}
.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain;}
.lenis.lenis-stopped{overflow:hidden;}
.lift{transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s ease,border-color .35s ease;}
.lift:hover{transform:translateY(-6px);box-shadow:0 22px 48px -24px rgba(40,20,10,.45);}
.btn-brand{background:var(--brand);color:#fff;box-shadow:0 12px 30px -12px oklch(0.65 0.21 35/.7);transition:transform .2s ease,background .2s ease,box-shadow .3s ease;}
.btn-brand:hover{background:var(--brand-strong);transform:translateY(-2px);box-shadow:0 16px 36px -12px oklch(0.65 0.21 35/.8);}
.btn-brand:active{transform:translateY(0) scale(.98);}
.btn-ghost{transition:transform .2s ease,background .2s ease,border-color .2s ease;}
.btn-ghost:hover{transform:translateY(-2px);}
.grp:hover .arrow-slide{transform:translateX(4px);}
.arrow-slide{transition:transform .25s ease;}
.float{animation:dosfloat 7s ease-in-out infinite;}
@keyframes dosfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.bar-fill{transform-origin:left;animation:dosgrow 1.2s cubic-bezier(.22,1,.36,1) .3s both;}
@keyframes dosgrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.hero-glow{background:radial-gradient(60% 55% at 50% -10%,oklch(0.65 0.21 35/.38),transparent 70%);}
.dot-grid{background-image:radial-gradient(oklch(1 0 0/.07) 1px,transparent 1px);background-size:22px 22px;}
.dot-light{background-image:radial-gradient(oklch(0.65 0.21 35/.06) 1px,transparent 1px);background-size:24px 24px;}
.glow-blob{position:absolute;border-radius:9999px;background:radial-gradient(circle,oklch(0.65 0.21 35/.18),transparent 70%);filter:blur(60px);pointer-events:none;}
.marquee-track{display:flex;width:max-content;animation:marquee 32s linear infinite;}
.marquee-mask:hover .marquee-track{animation-play-state:paused;}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.no-scrollbar{scrollbar-width:none;-ms-overflow-style:none;}
.no-scrollbar::-webkit-scrollbar{display:none;}
@media (prefers-reduced-motion: reduce){.float,.bar-fill,.marquee-track{animation:none!important}}
`

const PLAT_LABEL: Record<PlatId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

const DORES = [
  { icon: FileSpreadsheet, titulo: "Relatórios soltos", texto: "Cada plataforma manda um arquivo diferente. Juntar tudo na mão toma horas todo mês." },
  { icon: EyeOff, titulo: "Taxas escondidas", texto: "Comissão, entrega, promoção, VR… some no meio e você não enxerga o que está pesando." },
  { icon: HelpCircle, titulo: "Decisão no escuro", texto: "Sem o lucro real, não dá pra saber qual loja ou plataforma de fato vale a pena." },
]

const RELATORIOS: { id: PlatId; itens: string[] }[] = [
  { id: "ifood", itens: ["Financeiro / Conciliação", "Cardápio", "Pedidos", "Avaliações", "Qualidade e Super", "Promoções e negociações"] },
  { id: "99food", itens: ["Dados da loja", "Itens", "Pedidos"] },
  { id: "keeta", itens: ["Loja diária", "Itens", "Pedidos", "Dados da promoção"] },
]

const MODULOS = [
  { icon: LayoutDashboard, n: "Dashboard", d: "Visão geral da rede" },
  { icon: CalendarRange, n: "Relatório Diário", d: "Vendas dia a dia" },
  { icon: Wallet, n: "DRE / Resultado", d: "Seu lucro de verdade" },
  { icon: Gauge, n: "Diagnóstico", d: "Plano de ação por IA" },
  { icon: Coins, n: "Fluxo de Caixa", d: "Entradas e saídas" },
  { icon: Star, n: "Avaliações", d: "Notas e comentários" },
  { icon: Utensils, n: "Cardápio", d: "Top itens e ROI" },
  { icon: Receipt, n: "Pedidos", d: "Pagamento, VR, ticket" },
  { icon: Store, n: "Unidades", d: "DRE por loja" },
  { icon: FileUp, n: "Importação", d: "Suba os XLSX" },
]

/* DeliveryOS AI — o que a IA cruza pra montar o plano de ação. */
const AI_ANALISA: { i: LucideIcon; t: string; d: string }[] = [
  { i: TrendingUp, t: "Funil das 3 plataformas", d: "De visita a pedido — onde o cliente desiste em cada uma." },
  { i: Star, t: "Avaliações e reclamações reais", d: "Lê o texto dos comentários, não só a nota." },
  { i: Gauge, t: "Cancelamentos, CMV e margem", d: "O que está fora da meta e quanto isso custa." },
  { i: Target, t: "Marketing e promoções", d: "Quanto você gastou e o que de fato voltou." },
  { i: Utensils, t: "Produtos que puxam (ou travam)", d: "Top itens, complementos e o que sai junto." },
]

/* Rede / franqueador — benefícios do plano sob medida (fale conosco). */
const REDE: { icon: LucideIcon; t: string; d: string; tag?: string }[] = [
  {
    icon: Network,
    t: "Todas as lojas num painel",
    d: "Faturamento, pedidos e ranking de cada unidade, lado a lado e em tempo real.",
  },
  {
    icon: Wallet,
    t: "Financeiro da rede",
    d: "DRE do grupo, comparativo entre lojas e o resultado somado da operação inteira.",
  },
  {
    icon: Sparkles,
    t: "Consultor IA da rede",
    d: "Uma IA que analisa TODAS as lojas de uma vez: semáforo de saúde, benchmark, alertas e o plano da rede.",
    tag: "em breve",
  },
]

const TRUST = [
  { icon: ShieldCheck, t: "Conformidade com a LGPD" },
  { icon: Lock, t: "Conexão criptografada" },
  { icon: KeyRound, t: "Você não dá senha de nada" },
  { icon: Trash2, t: "Apague seus dados quando quiser" },
]

const FAQ = [
  { q: "Preciso dar a senha do meu iFood, 99 ou Keeta?", a: "Não. Você só sobe o relatório (XLSX) que já baixa hoje no portal de cada plataforma. A gente nunca pede senha nem acessa sua conta." },
  { q: "Funciona pra quantas lojas?", a: "De 1 até quantas você tiver. O preço é por loja, então você paga só pelo que usa." },
  { q: "Quais relatórios eu preciso baixar?", a: "Os de financeiro / conciliação, pedidos, cardápio e avaliações de cada plataforma. Dentro do sistema tem um guia mostrando onde clicar em cada portal." },
  { q: "Meus dados ficam seguros?", a: "Sim. Ficam só na sua conta, isolados e criptografados, e você apaga quando quiser. Nunca compartilhamos com ninguém." },
  { q: "Preciso instalar alguma coisa?", a: "Não. É tudo no navegador — abre, sobe a planilha e vê o painel na hora." },
  { q: "O que vem no plano Pro?", a: "Tudo do Essencial mais o financeiro completo: fluxo de caixa com contas a pagar e a receber, contas bancárias, cartões e categorias, importação OFX dos bancos pra conciliar o extrato e todos os módulos do sistema. É pra quem quer rodar todo o financeiro da operação num lugar só." },
  { q: "O que é o DeliveryOS AI?", a: "É a camada de inteligência do sistema. Ao abrir o diagnóstico de uma loja, a IA cruza funil, avaliações (com o texto das reclamações), cancelamentos, CMV, marketing e produtos, e escreve um plano de ação com as 3 prioridades do mês — o problema, o que está em jogo e como resolver. Você exporta tudo em PDF. Está no plano DeliveryOS AI, que inclui tudo do Pro." },
  { q: "Posso cancelar quando quiser?", a: "Pode, sem multa nem fidelidade. Cancela e pronto." },
]

const FEATURE_ROWS = [
  {
    img: "/landing/dre.png",
    icon: Store,
    tag: "Cada loja por dentro",
    titulo: "O raio-x de cada loja, num lugar só",
    texto:
      "Entra numa unidade e vê tudo consolidado das 3 plataformas — e o que cada uma representa de verdade no seu bolso.",
    bullets: [
      "KPIs consolidados: bruto, líquido, margem, ticket e nota",
      "Split de faturamento por plataforma (quem pesa mais)",
      "DRE da loja: bruto → taxas → CMV → margem real",
      "Você lança o CMV e a margem real aparece na hora",
    ],
  },
  {
    img: "/landing/dre1.png",
    icon: Wallet,
    tag: "DRE da loja",
    titulo: "Do faturamento ao lucro, linha por linha",
    texto:
      "A demonstração de resultado da loja — bruto, taxas de cada plataforma, CMV e a margem real — sem você abrir uma planilha.",
    bullets: [
      "Taxas de cada plataforma, abertas linha por linha",
      "CMV e custos operacionais descontados",
      "Margem e resultado real, no fim da conta",
    ],
  },
  {
    img: "/landing/avaliacoes.png",
    icon: Star,
    tag: "Reputação",
    titulo: "Saiba o que falam — e o que melhorar",
    texto:
      "Nota média, distribuição de estrelas e o que mais elogiam (e reclamam), das 3 plataformas juntas.",
    bullets: [
      "Nota e distribuição consolidadas",
      "O que elogiam e o que reclamam",
      "Comentários reais dos clientes",
    ],
  },
  {
    img: "/landing/cardapio.png",
    icon: Utensils,
    tag: "Cardápio & produtos",
    titulo: "O que vende — e onde o cliente desiste",
    texto:
      "O funil de conversão (de visita a pedido) e os itens que mais saem, com o que puxa e o que trava a venda.",
    bullets: [
      "Funil: visita → sacola → pedido",
      "Top itens vendidos e complementos",
      "Onde o cliente abandona o carrinho",
    ],
  },
]

/* Plano Pro — recursos do módulo financeiro (estilo "principais recursos"). */
const PRO_LEFT: { icon: LucideIcon; t: string; d: string; badge?: string }[] = [
  {
    icon: Store,
    t: "Visão multi-loja",
    d: "O consolidado de todas as franquias e o caixa de cada loja, lado a lado.",
    badge: "Franquia",
  },
  {
    icon: Receipt,
    t: "Contas a pagar e a receber",
    d: "Vencimentos, atrasos e o que ainda vai entrar — sem perder boleto.",
  },
  {
    icon: Landmark,
    t: "Importação OFX",
    d: "Sobe o extrato do banco e concilia com o que entrou do delivery.",
    badge: "OFX",
  },
]
const PRO_RIGHT: { icon: LucideIcon; t: string; d: string; badge?: string }[] = [
  {
    icon: CreditCard,
    t: "Contas e cartões",
    d: "Conta corrente, PJ e cartões: saldo e fatura de cada um, num lugar só.",
  },
  {
    icon: Tags,
    t: "Categorias e subcategorias",
    d: "Veja pra onde vai cada real, com categoria própria, ícone e cor.",
  },
  {
    icon: BarChart3,
    t: "Relatórios financeiros",
    d: "Receita, despesa e resultado do mês — por loja e no consolidado.",
  },
]

function ProFeature({
  icon: Icon,
  t,
  d,
  badge,
}: {
  icon: LucideIcon
  t: string
  d: string
  badge?: string
}) {
  return (
    <div>
      <span className="flex size-11 items-center justify-center rounded-xl bg-white text-[var(--brand-strong)] shadow-sm ring-1 ring-black/[0.05]">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <p className="mt-3 flex flex-wrap items-center gap-2 font-medium">
        {t}
        {badge ? (
          <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
            {badge}
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.5_0.01_48)]">{d}</p>
    </div>
  )
}

/** Print real do sistema numa moldura leve (borda + sombra). */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_30px_60px_-30px_rgba(40,20,10,.5)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  )
}

export function Landing() {
  const scrolled = useScrolled(20)

  // Smooth-scroll "buttery" (Lenis). Respeita prefers-reduced-motion e leva os
  // links âncora (#como, #precos…) com a mesma suavidade.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      lerp: 0.13,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]')
      if (!a) return
      const href = a.getAttribute("href")
      if (!href || href === "#") return
      const el = document.querySelector(href)
      if (el) {
        e.preventDefault()
        lenis.scrollTo(el as HTMLElement, { offset: -64 })
      }
    }
    document.addEventListener("click", onClick)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("click", onClick)
      lenis.destroy()
    }
  }, [])

  return (
    <div className="dos-root min-h-screen w-full overflow-x-hidden">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* NAV */}
      <nav
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "oklch(0.99 0.005 75 / .82)" : "transparent",
          backdropFilter: scrolled ? "blur(8px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(8px)" : "none",
          borderBottom: scrolled ? "0.5px solid oklch(0.2 0.01 48 / .08)" : "0.5px solid transparent",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#topo" className="flex items-center gap-2 font-medium">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand)] text-white shadow-[0_8px_20px_-8px_oklch(0.65_0.21_35/.8)]">
              <BarChart3 className="size-[18px]" strokeWidth={2.4} />
            </span>
            <span className="text-[17px] tracking-tight">Delivery OS</span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-[oklch(0.45_0.01_48)] md:flex">
            <a href="#experimente" className="transition-colors hover:text-[var(--brand)]">Como funciona</a>
            <a href="#sistema" className="transition-colors hover:text-[var(--brand)]">O sistema</a>
            <a href="#ia" className="inline-flex items-center gap-1 transition-colors hover:text-[var(--brand)]">
              <Sparkles className="size-3.5 text-[var(--brand)]" strokeWidth={2.4} />
              IA
            </a>
            <a href="#precos" className="transition-colors hover:text-[var(--brand)]">Preços</a>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="/login"
              className="text-sm font-medium text-[oklch(0.45_0.01_48)] transition-colors hover:text-[var(--brand)]"
            >
              Entrar
            </a>
            <a href="/cadastro" className="btn-brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium">
              Testar grátis
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header id="topo" className="relative overflow-hidden bg-[var(--ink)] pb-24 pt-32 text-white">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[oklch(0.85_0.05_60)]">
                <span className="size-1.5 rounded-full bg-[var(--brand)]" />
                Para donos de delivery
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-balance text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-[52px]">
                Descubra quanto você{" "}
                <span className="text-[oklch(0.78_0.16_50)]">realmente ganha</span>{" "}
                em cada plataforma
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-[oklch(0.78_0.012_60)] sm:text-lg lg:mx-0">
                O Delivery OS lê os relatórios do iFood, 99 e Keeta e mostra
                faturamento, taxas, repasses e lucro de cada loja — num painel só.
                Você sobe a planilha, a gente faz a conta.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <a href="#experimente" className="btn-brand grp inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium">
                  <Upload className="size-[18px]" strokeWidth={2.2} />
                  Descobrir meu lucro agora
                  <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
                </a>
                <a href="#experimente" className="btn-ghost inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-[15px] font-medium text-white hover:bg-white/5">
                  Ver como funciona
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-5 text-xs text-[oklch(0.65_0.01_60)]">
                Suba sua planilha e veja em minutos se está ganhando de verdade · sem cartão · sem senha
              </p>
            </Reveal>
          </div>

          <Reveal delay={420} y={40}>
            <div className="w-full">
              <Shot src="/landing/dashboard.png" alt="Painel da rede no Delivery OS" />
              <p className="mt-3 text-center text-xs text-[oklch(0.62_0.01_60)] lg:text-left">
                O painel da rede — faturamento, taxas e lucro de todas as lojas, consolidados.
              </p>
            </div>
          </Reveal>
        </div>
      </header>

      {/* LOGOS */}
      <section className="border-y border-black/5 bg-white py-7">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.01_48)]">
              Lê os relatórios que você já baixa de
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {(["ifood", "99food", "keeta"] as PlatId[]).map((id) => (
                <span key={id} className="lift inline-flex items-center gap-2.5 rounded-2xl border border-black/[0.07] bg-[var(--cream)] px-4 py-2.5 text-[15px] font-medium">
                  <PlatLogo id={id} size={28} className="rounded-lg" />
                  {PLAT_LABEL[id]}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* DORES */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-balance text-center text-3xl font-medium tracking-tight sm:text-4xl">
            Você sabe quanto sobra de verdade?
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mx-auto mt-4 max-w-lg text-center text-[oklch(0.5_0.01_48)]">
            O dinheiro entra, mas as taxas comem por fora. Sem o número real, é tudo no achismo.
          </p>
        </Reveal>

        <Reveal delay={120} y={36}>
          <div className="mx-auto mt-12 max-w-3xl">
            <PainBreakdown />
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {DORES.map((d, i) => (
            <Reveal key={d.titulo} delay={i * 110}>
              <div className="lift h-full rounded-2xl border border-black/[0.07] bg-white p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[oklch(0.95_0.04_30)] text-[var(--brand-strong)]">
                  <d.icon className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-medium">{d.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.5_0.01_48)]">{d.texto}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* EXPERIMENTE COM A SUA PLANILHA (demo ao vivo, no navegador) */}
      <section id="experimente" className="relative overflow-hidden bg-white pb-12 pt-24">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob left-1/2 top-16 h-72 w-[40rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Arraste — esquerda */}
            <Reveal delay={220} className="order-2 lg:order-1">
              <ExperimenteDemo />
            </Reveal>

            {/* Texto + passos — direita */}
            <div className="order-1 lg:order-2">
              <Reveal>
                <span className="block w-fit rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
                  Experimente agora · de graça
                </span>
              </Reveal>
              <Reveal delay={70}>
                <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">
                  Suba a sua planilha e veja seu lucro real
                </h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="mt-4 max-w-lg text-[oklch(0.5_0.01_48)]">
                  Baixa o relatório do iFood, 99 Food ou Keeta, joga aqui do lado e veja na hora quanto as taxas comem e o que de fato entra na sua conta. Sem cadastro, sem senha.
                </p>
              </Reveal>

              <Reveal delay={180}>
                <div className="mt-7 space-y-3">
                  {[
                    { n: 1, t: "Baixa o relatório da sua plataforma", d: "iFood (Conciliação), 99 Food (Dados da loja) ou Keeta (Pedidos)" },
                    { n: 2, t: "Do mês que você quer ver", d: "em .xlsx ou .csv" },
                    { n: 3, t: "Arrasta a planilha aqui", d: "o resultado aparece na hora" },
                  ].map((s) => (
                    <div key={s.n} className="flex items-start gap-3 rounded-xl border border-black/[0.06] bg-[var(--cream)] px-4 py-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[11px] font-medium text-white">{s.n}</span>
                      <div>
                        <p className="text-sm font-medium leading-tight">{s.t}</p>
                        <p className="text-xs text-[oklch(0.5_0.01_48)]">{s.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* RELATÓRIOS DISPONÍVEIS */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-12">
        <Reveal>
          <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
            Todos os relatórios, num lugar só
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mx-auto mt-4 max-w-xl text-center text-[oklch(0.5_0.01_48)]">
            O Delivery OS entende os principais relatórios das 3 plataformas — financeiro, cardápio, pedidos e avaliações.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {RELATORIOS.map((r, i) => (
            <Reveal key={r.id} delay={i * 110}>
              <div className="lift h-full rounded-2xl border border-black/[0.07] bg-white p-6">
                <div className="flex items-center gap-3">
                  <PlatLogo id={r.id} size={40} />
                  <span className="text-lg font-medium">{PLAT_LABEL[r.id]}</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-[15px]">
                  {r.itens.map((it) => (
                    <li key={it} className="flex items-center gap-2.5">
                      <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Hub de relatórios — print real, faixa larga */}
        <Reveal delay={140} y={36}>
          <div className="mx-auto mt-14 max-w-5xl px-5">
            <p className="mb-5 text-center text-[oklch(0.5_0.01_48)]">
              E a rede inteira vira{" "}
              <b className="font-medium text-foreground">relatório pronto</b> —
              comparativo entre lojas, ranking, evolução, ROI de campanha e mais,
              num hub só.
            </p>
            <Shot
              src="/landing/relatorios.png"
              alt="Hub de relatórios da rede no Delivery OS"
            />
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-[oklch(0.65_0.21_35/.4)] bg-[var(--brand-soft)] px-4 py-2 text-sm font-medium text-[var(--brand-strong)]">
              <Zap className="size-4" strokeWidth={2.2} />
              Novos relatórios e plataformas chegando
            </span>
          </div>
        </Reveal>
      </section>

      {/* VEJA POR DENTRO (TELAS) — zig-zag alternado */}
      <section id="sistema" className="relative overflow-hidden bg-white py-24">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob -left-28 top-44 h-80 w-80" />
        <div className="glow-blob -right-28 bottom-44 h-80 w-80" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-sm font-medium text-[var(--brand)]">Veja por dentro</p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-2 text-center text-3xl font-medium tracking-tight sm:text-4xl">
              Telas feitas pra dono de loja, não pra contador
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-4 max-w-xl text-center text-[oklch(0.5_0.01_48)]">
              Cada número aberto, por loja e por plataforma — do topo da rede ao detalhe de uma só unidade.
            </p>
          </Reveal>

          <div className="mt-16 space-y-20 lg:space-y-28">
            {FEATURE_ROWS.map(({ img, icon: Icon, tag, titulo, texto, bullets }, i) => {
              const reverse = i % 2 === 1
              return (
                <Reveal key={titulo} y={36}>
                  <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                    <div className={`lift ${reverse ? "lg:order-2" : ""}`}>
                      <Shot src={img} alt={titulo} />
                    </div>
                    <div className={reverse ? "lg:order-1" : ""}>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-strong)]">
                        <Icon className="size-3.5" strokeWidth={2.4} />
                        {tag}
                      </span>
                      <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">{titulo}</h3>
                      <p className="mt-3 text-[oklch(0.45_0.02_45)]">{texto}</p>
                      <ul className="mt-5 space-y-2.5 text-[15px]">
                        {bullets.map((f) => (
                          <li key={f} className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* DELIVERYOS AI — diagnóstico + plano de ação por IA */}
      <section id="ia" className="relative overflow-hidden bg-[var(--ink)] py-24 text-white">
        <div className="hero-glow pointer-events-none absolute inset-0 opacity-70" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <span className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[oklch(0.85_0.08_60)]">
              <Sparkles className="size-3.5 text-[var(--brand)]" strokeWidth={2.4} />
              DeliveryOS AI · Novo
            </span>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-4 text-center text-3xl font-medium tracking-tight sm:text-4xl">
              A IA lê a sua loja e diz o que fazer
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[oklch(0.78_0.012_60)]">
              Todo mês, o DeliveryOS AI cruza funil, avaliações, cancelamentos,
              marketing e produtos de cada loja — e aponta as 3 ações que mais
              mexem no seu resultado. Não é mais um dashboard: é plano de ação.
            </p>
          </Reveal>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
            {/* Print real do Diagnóstico + Plano de ação */}
            <Reveal y={36}>
              <Shot
                src="/landing/diagnostico.png"
                alt="Diagnóstico da loja com o plano de ação gerado pela IA"
              />
            </Reveal>

            {/* O que a IA analisa */}
            <div>
              <Reveal>
                <h3 className="text-xl font-medium tracking-tight sm:text-2xl">
                  Ela cruza o que você não tem tempo de cruzar
                </h3>
              </Reveal>
              <div className="mt-6 space-y-3.5">
                {AI_ANALISA.map((f, i) => (
                  <Reveal key={f.t} delay={i * 70}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[oklch(0.82_0.14_55)]">
                        <f.i className="size-4" strokeWidth={2.2} />
                      </span>
                      <div>
                        <p className="font-medium leading-tight">{f.t}</p>
                        <p className="mt-0.5 text-sm text-[oklch(0.72_0.012_60)]">{f.d}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
              <Reveal delay={340}>
                <div className="mt-7 flex flex-wrap gap-2.5 text-xs text-[oklch(0.72_0.01_60)]">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                    <FileUp className="size-3.5" strokeWidth={2.2} />
                    Exporta em PDF com o plano junto
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                    <Sparkles className="size-3.5" strokeWidth={2.2} />
                    Gerado sob demanda, em 1 clique
                  </span>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* PLANO PRO — gestão financeira / multi-loja */}
      <section className="relative overflow-hidden border-t border-black/[0.05] bg-white py-24">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-60" />
        <div className="glow-blob -left-28 top-32 h-80 w-80" />
        <div className="glow-blob -right-28 bottom-24 h-80 w-80" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <span className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[var(--ink)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white">
              <Coins className="size-3.5 text-[var(--brand)]" strokeWidth={2.4} />
              Plano Pro
            </span>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-4 text-center text-3xl font-medium tracking-tight sm:text-4xl">
              O financeiro de todas as lojas, num lugar só
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[oklch(0.5_0.01_48)]">
              Não é só o delivery. O Pro traz o caixa completo da operação — contas a pagar e a receber, bancos conciliados por OFX e o consolidado de todas as suas franquias, loja por loja.
            </p>
          </Reveal>

          {/* Carrossel das telas, centralizado */}
          <Reveal y={36}>
            <div className="mx-auto mt-12 max-w-3xl">
              <CaixaCarousel />
            </div>
          </Reveal>

          {/* Recursos, em grade (sem espremer) */}
          <div className="mx-auto mt-16 grid max-w-5xl gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {[...PRO_LEFT, ...PRO_RIGHT].map((f, n) => (
              <Reveal key={f.t} delay={(n % 3) * 80} y={24}>
                <ProFeature {...f} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-14 flex justify-center">
              <a href="#precos" className="btn-brand grp inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium">
                Ver o plano Pro
                <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MÓDULOS */}
      <section className="relative overflow-hidden bg-[var(--cream)] py-24">
        <div className="glow-blob -right-24 top-6 h-72 w-72" />
        <div className="glow-blob -left-24 bottom-6 h-72 w-72" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
              Tudo que vem no sistema
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map((m, i) => (
              <Reveal key={m.n} delay={(i % 4) * 80}>
                <div className="lift group flex h-full items-center gap-3.5 rounded-2xl border border-black/[0.07] bg-white p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] transition-colors group-hover:bg-[var(--brand)] group-hover:text-white">
                    <m.icon className="size-5" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="font-medium leading-tight">{m.n}</p>
                    <p className="text-xs text-[oklch(0.5_0.01_48)]">{m.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="bg-[var(--ink)] py-24 text-white">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-[0_14px_30px_-14px_oklch(0.65_0.21_35/.9)]">
                <ShieldCheck className="size-7" strokeWidth={1.9} />
              </span>
              <h2 className="max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">
                Seus dados, no seu controle
              </h2>
              <p className="max-w-2xl text-[oklch(0.78_0.012_60)]">
                Você não dá senha nem conecta nada. Sobe o arquivo que já baixa hoje. Seus dados ficam só na sua conta — isolados, criptografados e privados. A gente nunca compartilha com ninguém.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((b, i) => (
              <Reveal key={b.t} delay={i * 90}>
                <div className="flex h-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-[oklch(0.82_0.14_55)]">
                    <b.icon className="size-5" strokeWidth={2} />
                  </span>
                  <p className="text-sm text-[oklch(0.85_0.01_60)]">{b.t}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PROVA SOCIAL */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="lift relative overflow-hidden rounded-3xl border border-[oklch(0.65_0.21_35/.2)] bg-gradient-to-br from-[oklch(0.97_0.03_45)] to-white p-8 text-center sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
              <Zap className="size-3.5" strokeWidth={2.4} />
              Testado no fogo
            </span>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance text-2xl font-medium tracking-tight sm:text-3xl">
              Feito por quem vive de delivery — não por quem só programa
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[oklch(0.45_0.02_45)]">
              O Delivery OS nasceu rodando na operação real da rede <span className="font-medium">Churrasco no Pote</span>: 9 lojas, 3 plataformas, fechamento todo dia. O que você usa já foi provado no balcão.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
              {[
                { v: 9, s: "", l: "lojas em operação" },
                { v: 3, s: "", l: "plataformas integradas" },
                { v: 100, s: "%", l: "dados reais, sem mock" },
              ].map((k) => (
                <div key={k.l}>
                  <p className="text-3xl font-medium tracking-tight text-[var(--brand-strong)]">
                    <CountUp to={k.v} suffix={k.s} />
                  </p>
                  <p className="mt-0.5 text-xs text-[oklch(0.5_0.01_48)]">{k.l}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-12">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.01_48)]">
              Restaurantes que já rodam no Delivery OS
            </p>
            <div
              className="marquee-mask relative mt-6 overflow-hidden"
              style={{
                maskImage: "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)",
                WebkitMaskImage: "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)",
              }}
            >
              {/* TODO: trocar os placeholders pelos logos reais dos clientes */}
              <div className="marquee-track gap-4 py-2">
                {[
                  "Burger House", "Pizza Express", "Sushi Place", "Açaí & Cia", "Don Taco", "Café Central",
                  "Burger House", "Pizza Express", "Sushi Place", "Açaí & Cia", "Don Taco", "Café Central",
                ].map((m, i) => (
                  <span
                    key={i}
                    className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-black/[0.06] bg-white px-5 py-3 text-[15px] font-medium text-[oklch(0.45_0.01_48)] shadow-sm"
                  >
                    <Store className="size-4 text-[oklch(0.6_0.01_48)]" strokeWidth={2} />
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="relative overflow-hidden bg-white py-24">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob left-1/2 top-10 h-72 w-[44rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">Escolha o seu plano</h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mt-3 text-center text-[oklch(0.5_0.01_48)]">Por loja, por mês. Sem fidelidade — cancela quando quiser.</p>
          </Reveal>

          <div className="mx-auto mt-12 grid items-stretch gap-6 md:grid-cols-3">
            {/* ESSENCIAL */}
            <Reveal delay={120}>
              <div className="lift relative flex h-full flex-col overflow-hidden rounded-3xl border border-black/[0.09] bg-white p-7">
                <span className="absolute right-6 top-6 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-strong)]">Comece aqui</span>
                <h3 className="text-lg font-medium">Essencial</h3>
                <p className="mt-1 text-sm text-[oklch(0.5_0.01_48)]">Pra ver seu lucro no delivery</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-5xl font-medium tracking-tight">R$ 49</span>
                  <span className="text-sm text-[oklch(0.5_0.01_48)]">/loja · mês</span>
                </div>
                <ul className="mt-6 space-y-3 text-[15px]">
                  {[
                    "Upload iFood, 99 e Keeta",
                    "Painel de lucro real por loja",
                    "Comparação entre plataformas",
                    "Taxas e repasses abertos",
                    "Histórico mês a mês",
                    "Suporte por e-mail",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <a href="/cadastro" className="btn-ghost grp flex w-full items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3.5 text-base font-medium hover:bg-black/[0.02]">
                    Começar 7 dias grátis
                    <ArrowRight className="arrow-slide size-5" strokeWidth={2.2} />
                  </a>
                  <p className="mt-3 text-center text-xs text-[oklch(0.5_0.01_48)]">Sem cartão pra testar</p>
                </div>
              </div>
            </Reveal>

            {/* PRO */}
            <Reveal delay={180}>
              <div className="lift relative flex h-full flex-col overflow-hidden rounded-3xl border border-black/[0.09] bg-white p-7">
                <span className="absolute right-6 top-6 rounded-full bg-[oklch(0.94_0.005_48)] px-3 py-1 text-xs font-medium text-[oklch(0.45_0.01_48)]">Completo</span>
                <h3 className="flex items-center gap-2 text-lg font-medium">
                  <Zap className="size-4 text-[var(--brand)]" strokeWidth={2.4} />
                  Pro
                </h3>
                <p className="mt-1 text-sm text-[oklch(0.5_0.01_48)]">Gestão financeira completa</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-5xl font-medium tracking-tight">R$ 99</span>
                  <span className="text-sm text-[oklch(0.5_0.01_48)]">/loja · mês</span>
                </div>
                <p className="mt-5 text-[13px] font-medium text-[var(--brand-strong)]">Tudo do Essencial, e mais:</p>
                <ul className="mt-3 space-y-3 text-[15px]">
                  {[
                    { i: Coins, t: "Fluxo de caixa: contas a pagar e a receber" },
                    { i: Wallet, t: "Contas bancárias, cartões e categorias" },
                    { i: Landmark, t: "Importação OFX dos bancos (concilia o extrato)" },
                    { i: LayoutDashboard, t: "DRE completo e todos os módulos" },
                  ].map((f) => (
                    <li key={f.t} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                        <f.i className="size-3" strokeWidth={2.6} />
                      </span>
                      {f.t}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <a href="/cadastro" className="btn-ghost flex w-full items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3.5 text-base font-medium hover:bg-black/[0.02]">
                    Quero o Pro
                  </a>
                  <p className="mt-3 text-center text-xs text-[oklch(0.5_0.01_48)]">Por loja · cancela quando quiser</p>
                </div>
              </div>
            </Reveal>

            {/* DELIVERYOS AI — destaque */}
            <Reveal delay={240}>
              <div className="lift relative flex h-full flex-col overflow-hidden rounded-3xl border border-[oklch(0.65_0.21_35/.5)] bg-[var(--ink)] p-7 text-white shadow-[0_36px_70px_-30px_oklch(0.65_0.21_35/.6)] md:-mt-3 md:mb-[-0.75rem]">
                <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70" />
                <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-2.5 py-1 text-[11px] font-semibold text-white">
                  <Sparkles className="size-3" strokeWidth={2.6} />
                  Novo
                </span>
                <h3 className="relative flex items-center gap-2 text-lg font-medium">
                  <Sparkles className="size-4 text-[var(--brand)]" strokeWidth={2.4} />
                  DeliveryOS AI
                </h3>
                <p className="relative mt-1 text-sm text-[oklch(0.72_0.012_60)]">A IA que lê a loja e te diz o que fazer</p>
                <div className="relative mt-5 flex items-baseline gap-1.5">
                  <span className="text-5xl font-medium tracking-tight">R$ 159</span>
                  <span className="text-sm text-[oklch(0.62_0_0)]">/loja · mês</span>
                </div>
                <p className="relative mt-5 text-[13px] font-medium text-[oklch(0.8_0.12_55)]">Tudo do Pro, e mais:</p>
                <ul className="relative mt-3 space-y-3 text-[15px] text-[oklch(0.88_0_0)]">
                  {[
                    { i: Gauge, t: "Diagnóstico inteligente de cada loja" },
                    { i: Target, t: "Plano de ação: as 3 prioridades do mês" },
                    { i: Star, t: "Lê avaliações, cancelamentos, marketing e produtos" },
                    { i: FileUp, t: "Exporta o diagnóstico em PDF com o plano" },
                  ].map((f) => (
                    <li key={f.t} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[oklch(0.82_0.14_55)]">
                        <f.i className="size-3" strokeWidth={2.6} />
                      </span>
                      {f.t}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-auto pt-7">
                  <a href="/cadastro" className="btn-brand grp flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-medium">
                    Quero a IA
                    <ArrowRight className="arrow-slide size-5" strokeWidth={2.2} />
                  </a>
                  <p className="mt-3 text-center text-xs text-[oklch(0.6_0_0)]">Por loja · cancela quando quiser</p>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={220}>
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-[oklch(0.5_0.01_48)]">
              Comece no Essencial e veja seu lucro hoje. Suba pro Pro pra rodar todo o financeiro da operação — ou pro DeliveryOS AI pra ter a inteligência que lê a loja e escreve o plano de ação todo mês.
            </p>
          </Reveal>

          {/* REDE / FRANQUEADOR — fale conosco */}
          <Reveal delay={260} y={32}>
            <div className="relative mx-auto mt-10 max-w-5xl overflow-hidden rounded-3xl border border-[oklch(0.65_0.21_35/.25)] bg-gradient-to-br from-[var(--brand-soft)] via-white to-white p-7 shadow-[0_30px_60px_-34px_oklch(0.65_0.21_35/.5)] sm:p-9">
              <div className="glow-blob -right-16 -top-16 h-56 w-56" />
              <div className="relative grid gap-8 lg:grid-cols-[1fr_15rem] lg:items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white">
                    <Building2 className="size-3.5 text-[var(--brand)]" strokeWidth={2.4} />
                    Para redes e franqueadores
                  </span>
                  <h3 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">
                    É franqueador? Tem uma rede de lojas?
                  </h3>
                  <p className="mt-2 max-w-xl text-[oklch(0.45_0.02_45)]">
                    Preço sob medida por volume — e um painel feito pra quem olha
                    a rede inteira, não uma loja só.
                  </p>

                  <div className="mt-6 grid gap-5 sm:grid-cols-3">
                    {REDE.map((r) => (
                      <div key={r.t}>
                        <span className="flex size-10 items-center justify-center rounded-xl bg-white text-[var(--brand-strong)] shadow-sm ring-1 ring-black/[0.05]">
                          <r.icon className="size-5" strokeWidth={2} />
                        </span>
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          {r.t}
                          {r.tag ? (
                            <span className="rounded-full bg-[var(--brand-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--brand-strong)]">
                              {r.tag}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-[oklch(0.5_0.01_48)]">
                          {r.d}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-3">
                  <a
                    href="mailto:suporte@deliveryos.food?subject=Sou%20franqueador%20—%20quero%20conhecer%20o%20plano%20rede"
                    className="btn-brand grp inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium"
                  >
                    <Mail className="size-[18px]" strokeWidth={2.2} />
                    Fale conosco
                  </a>
                  <p className="text-center text-xs leading-relaxed text-[oklch(0.5_0.01_48)]">
                    Valores sob medida pra sua rede — quanto mais lojas, melhor a conta.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[var(--cream)] py-24">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">Perguntas frequentes</h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 50}>
                <FaqItem q={f.q} a={f.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden bg-[var(--ink)] py-24 text-center text-white">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-2xl px-5">
          <Reveal>
            <h2 className="text-balance text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
              Pare de adivinhar.
              <br />
              Comece a enxergar o lucro.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-4 max-w-md text-[oklch(0.78_0.012_60)]">
              Veja em minutos se você está ganhando de verdade em cada plataforma.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <a href="#experimente" className="btn-brand grp mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-medium">
              <Upload className="size-5" strokeWidth={2.2} />
              Descobrir meu lucro agora
              <ArrowRight className="arrow-slide size-5" strokeWidth={2.2} />
            </a>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-6 font-mono text-sm text-[oklch(0.7_0.05_55)]">deliveryos.food</p>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[var(--ink2)] py-8 text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <div className="flex items-center gap-2 font-medium text-white">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
              <BarChart3 className="size-4" strokeWidth={2.4} />
            </span>
            Delivery OS
          </div>
          <p className="text-xs text-white/50">© 2026 Delivery OS · deliveryos.food</p>
        </div>
      </footer>
    </div>
  )
}

/** Item de FAQ — acordeão com expansão animada (max-height). */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-black/[0.015]"
      >
        <span className="font-medium">{q}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-[var(--brand)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
        />
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed text-[oklch(0.45_0.01_48)]">{a}</p>
        </div>
      </div>
    </div>
  )
}
