"use client"

import { useEffect, useRef, useState } from "react"
import Lenis from "lenis"
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  EyeOff,
  FileSpreadsheet,
  FileUp,
  Gauge,
  HelpCircle,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Lock,
  Mail,
  MessageSquareText,
  Network,
  CalendarClock,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { ExperimenteDemo } from "./_demo"
import { Reveal, useScrolled } from "./_motion"
import { PainBreakdown, PlatLogo, type PlatId } from "./_screens"
import { reportsByPlatform } from "@/lib/reports-catalog"
import { precoStr, valorMensalExibido } from "@/lib/pricing"

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
.rx-tab-in{animation:rxtabin .38s cubic-bezier(.22,1,.36,1) both;}
@keyframes rxtabin{from{opacity:0;transform:translateY(10px) scale(.995)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.float,.bar-fill,.marquee-track,.rx-tab-in{animation:none!important}}
`

const PLAT_LABEL: Record<PlatId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/* Subtítulo de cada plataforma na seção de cobertura. Deixa claro que a
   diferença de número é da plataforma (99/Keeta oferecem menos relatórios) —
   o sistema lê tudo que cada uma disponibiliza. */
const PLAT_SUB: Record<PlatId, string> = {
  ifood: "A integração mais profunda",
  "99food": "Tudo que a 99 disponibiliza",
  keeta: "Tudo que a Keeta disponibiliza",
}

/* Acento de marca por plataforma na seção de cobertura — card tingido + selo
   na cor da plataforma (iFood vermelho, 99 amarelo, Keeta amarelo→verde). */
const PLAT_ACCENT: Record<PlatId, { card: string; chip: string }> = {
  ifood: {
    card: "border-[#ea1d2c47] bg-gradient-to-br from-[#ea1d2c33] via-[#ea1d2c14] to-transparent",
    chip: "bg-[#ea1d2c1a] text-[#b81824]",
  },
  "99food": {
    card: "border-[#f0b90055] bg-gradient-to-br from-[#f5c51a42] via-[#f5c51a1a] to-transparent",
    chip: "bg-[#f0b9002e] text-[#8a6d00]",
  },
  keeta: {
    card: "border-[#19b8944a] bg-gradient-to-br from-[#ffcd0038] via-[#19b89422] to-transparent",
    chip: "bg-[#19b89422] text-[#0e7c63]",
  },
}

const DORES = [
  { icon: FileSpreadsheet, titulo: "Relatórios soltos", texto: "Cada plataforma manda um arquivo diferente. Juntar tudo na mão toma horas todo mês." },
  { icon: EyeOff, titulo: "Taxas escondidas", texto: "Comissão, entrega, promoção, VR… some no meio e você não enxerga o que está pesando." },
  { icon: HelpCircle, titulo: "Decisão no escuro", texto: "Sem o lucro real, não dá pra saber qual plataforma de fato vale a pena." },
]

/* Cobertura por plataforma — derivada do catálogo oficial (reports-catalog.ts)
   pra nunca desatualizar em relação ao que o sistema realmente lê. */
/* Rótulo SÓ na landing (marketing): deixa dois relatórios parecidos mais
   distintos pra quem só está conhecendo. Nas telas operacionais (guia, config)
   o nome real da Keeta é mantido pra o lojista achar o arquivo no portal. */
const LANDING_NOME: Record<string, string> = {
  "Pedidos recentes": "Taxas e promoções por pedido",
}
const nomeLanding = (n: string) => LANDING_NOME[n] ?? n
const RELATORIOS: { id: PlatId; itens: string[] }[] = [
  { id: "ifood", itens: reportsByPlatform("ifood").map((r) => nomeLanding(r.name)) },
  { id: "99food", itens: reportsByPlatform("99food").map((r) => nomeLanding(r.name)) },
  { id: "keeta", itens: reportsByPlatform("keeta").map((r) => nomeLanding(r.name)) },
]


/* Ato 2 — rede / franqueador (bento do painel consolidado). */
const REDE: { icon: LucideIcon; t: string; d: string; tag?: string }[] = [
  {
    icon: Network,
    t: "Ranking de lojas",
    d: "Faturamento e resultado de cada unidade, lado a lado e em tempo real.",
  },
  {
    icon: Wallet,
    t: "DRE do grupo",
    d: "O resultado somado da operação inteira, consolidado num lugar só.",
  },
  {
    icon: Sparkles,
    t: "Semáforo IA da rede",
    d: "Uma IA que olha todas as lojas de uma vez: saúde, benchmark e alertas.",
    tag: "em breve",
  },
]

const TRUST = [
  { icon: ShieldCheck, t: "Conformidade com a LGPD" },
  { icon: Lock, t: "Conexão criptografada" },
  { icon: KeyRound, t: "Você não dá senha de nada" },
  { icon: Trash2, t: "Apague seus dados quando quiser" },
]

/* PLACEHOLDER: cliente real, não inventar */
const DEPOIMENTOS = [
  { nome: "[Nome do cliente]", loja: "[Loja / cidade]", texto: "[Depoimento real — a preencher]" },
  { nome: "[Nome do cliente]", loja: "[Loja / cidade]", texto: "[Depoimento real — a preencher]" },
]

const FAQ = [
  { q: "Preciso dar a senha do meu iFood, 99 ou Keeta?", a: "Não. Você só sobe o relatório (XLSX) que já baixa hoje no portal de cada plataforma. A gente nunca pede senha nem acessa sua conta." },
  { q: "Funciona só pra minha loja?", a: "Sim. O Delivery OS foi feito pra você ver o lucro da sua loja. E se um dia você tiver mais de uma, ele consolida todas — mas isso é opcional." },
  { q: "Quais relatórios eu preciso baixar?", a: "Os de financeiro / conciliação, pedidos, cardápio e avaliações de cada plataforma. Dentro do sistema tem um guia mostrando onde clicar em cada portal." },
  { q: "Meus dados ficam seguros?", a: "Sim. Ficam só na sua conta, isolados e criptografados, e você apaga quando quiser. Nunca compartilhamos com ninguém." },
  { q: "Preciso instalar alguma coisa?", a: "Não. É tudo no navegador — abre, sobe a planilha e vê o painel na hora." },
  { q: "O que vem no plano Pro?", a: "Tudo do Essencial mais o financeiro completo: fluxo de caixa com contas a pagar e a receber, contas bancárias, cartões e categorias, importação OFX dos bancos pra conciliar o extrato e todos os módulos do sistema. É pra quem quer rodar todo o financeiro da operação num lugar só." },
  { q: "O que é o DeliveryOS AI?", a: "É a camada de inteligência do sistema. Ao abrir o diagnóstico de uma loja, a IA cruza funil, avaliações (com o texto das reclamações), cancelamentos, CMV, marketing e produtos, e escreve um plano de ação com as 3 prioridades do mês — o problema, o que está em jogo e como resolver. Você exporta tudo em PDF. E tem o Nino, seu consultor de IA: você pergunta como mandaria pro seu sócio (\"como está meu faturamento?\", \"qual loja vende mais?\", \"meu cancelamento subiu?\") e ele responde na hora com os seus números reais. Tudo no plano DeliveryOS AI, que inclui o Pro." },
  { q: "Posso cancelar quando quiser?", a: "Pode, sem multa nem fidelidade. Cancela e pronto." },
]


/** Ícone do Instagram (o lucide desta versão não exporta um). */
function IgIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
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

/** Print real dentro de uma moldura de navegador (barra + url falsa) + callout. */
function ShotBrowser({
  src,
  alt,
  url,
  callout,
}: {
  src: string
  alt: string
  url: string
  callout?: string
}) {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_30px_60px_-30px_rgba(40,20,10,.5)]">
        <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[oklch(0.97_0.005_60)] px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[oklch(0.72_0.17_25)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.85_0.14_85)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.78_0.15_145)]" />
          </span>
          <span className="ml-2 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-[oklch(0.55_0.01_48)] ring-1 ring-black/[0.05]">
            {url}
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="block w-full" />
      </div>
      {callout ? (
        <span className="absolute -right-2 top-16 hidden items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_-8px_oklch(0.65_0.21_35/.8)] lg:inline-flex">
          <ArrowRight className="size-3.5 -scale-x-100" strokeWidth={2.6} />
          {callout}
        </span>
      ) : null}
    </div>
  )
}

/** Abas do "Por dentro do sistema" — funde Veja por dentro + IA + Pro num
 *  bloco só (menos rolagem, sobretudo no mobile: 1 aba por vez). */
const PORDENTRO_TABS: {
  key: string
  label: string
  badge?: string
  sparkle?: boolean
  /** Aba com render customizado (o painel do Nino), sem o layout padrão. */
  nino?: boolean
  img: string
  url: string
  callout: string
  tag: string
  titulo: string
  texto: string
  bullets: string[]
}[] = [
  {
    key: "ia",
    label: "Nino AI",
    sparkle: true,
    nino: true,
    img: "/landing/diagnostico.png",
    url: "app.deliveryos.food/unidade/diagnostico",
    callout: "as 3 ações do mês",
    tag: "Nino AI",
    titulo: "A IA lê a sua loja e diz o que fazer",
    texto:
      "Todo mês cruza tudo e aponta as 3 ações que mais mexem no resultado. E o Nino, seu consultor de IA, responde na hora qualquer pergunta sobre a operação, com os seus números reais.",
    bullets: [
      "Nino AI: pergunte e ele responde na hora",
      "Funil das 3 plataformas — onde o cliente desiste",
      "Lê o texto das avaliações, não só a nota",
      "Cancelamentos, CMV e margem fora da meta",
      "Marketing: quanto gastou e o que de fato voltou",
      "Produtos que puxam (ou travam) a venda",
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro / DRE",
    img: "/landing/dre.png",
    url: "app.deliveryos.food/unidade/resultado",
    callout: "a margem real, aberta",
    tag: "Cada loja por dentro",
    titulo: "O raio-x da sua loja, num lugar só",
    texto:
      "Tudo consolidado das 3 plataformas — e o que cada uma representa de verdade no seu bolso.",
    bullets: [
      "KPIs consolidados: bruto, líquido, margem, ticket e nota",
      "Split de faturamento por plataforma (quem pesa mais)",
      "DRE da loja: bruto → taxas → CMV → margem real",
      "Você lança o CMV e a margem real aparece na hora",
    ],
  },
  {
    key: "avaliacoes",
    label: "Avaliações",
    img: "/landing/avaliacoes.png",
    url: "app.deliveryos.food/unidade/avaliacoes",
    callout: "nota das 3 plataformas",
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
    key: "cardapio",
    label: "Cardápio",
    img: "/landing/cardapio.png",
    url: "app.deliveryos.food/unidade/cardapio",
    callout: "onde o cliente desiste",
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
  {
    key: "caixa",
    label: "Fluxo de Caixa",
    badge: "Pro",
    img: "/landing/financeiro.png",
    url: "app.deliveryos.food/caixa",
    callout: "o caixa completo",
    tag: "Plano Pro",
    titulo: "Todo o seu financeiro num lugar só",
    texto:
      "Não é só o delivery — o caixa completo da sua operação, sem abrir planilha.",
    bullets: [
      "Caixa de toda a operação, conta por conta",
      "Contas a pagar e a receber, sem perder boleto",
      "Importação OFX: concilia o extrato do banco",
      "Contas, cartões e faturas num lugar só",
      "Categorias e subcategorias (pra onde vai cada real)",
      "Relatórios: receita, despesa e resultado do mês",
    ],
  },
]

/** Módulos que não viram aba, listados compactos abaixo das abas. */
const MAIS_MODULOS = [
  "Dashboard",
  "Relatório Diário",
  "Pedidos",
  "Unidades",
  "Importação",
]

function PorDentroTabs() {
  const [tab, setTab] = useState(0)
  const t = PORDENTRO_TABS[tab]!
  return (
    <div>
      {/* pílulas — 1 aba por vez (compacto no mobile) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PORDENTRO_TABS.map((x, i) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(i)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
              i === tab
                ? "bg-[var(--brand)] text-white shadow-[0_12px_28px_-12px_oklch(0.65_0.21_35/.8)]"
                : "border border-black/10 bg-white text-[oklch(0.4_0.01_48)] hover:border-[var(--brand)]"
            }`}
          >
            {x.sparkle && (
              <Sparkles
                className={`size-3.5 ${i === tab ? "text-white" : "text-[var(--brand)]"}`}
                strokeWidth={2.4}
              />
            )}
            {x.label}
            {x.badge && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold uppercase ${
                  i === tab
                    ? "bg-white/20 text-white"
                    : "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                }`}
              >
                {x.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* conteúdo do tab ativo — key no wrapper reanima a cada troca */}
      {t.nino ? (
        <div key={t.key} className="mt-8">
          <NinoTabPanel tab={t} />
        </div>
      ) : (
        <div
          key={t.key}
          className="rx-tab-in mt-8 grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
        >
          <div className="order-2 lg:order-1">
            <ShotBrowser
              src={t.img}
              alt={t.titulo}
              url={t.url}
              callout={t.callout}
            />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
              {t.tag}
            </span>
            <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
              {t.titulo}
            </h3>
            <p className="mt-2 text-[oklch(0.45_0.01_48)]">{t.texto}</p>
            <ul className="mt-4 space-y-2">
              {t.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                    strokeWidth={2.6}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* E mais no sistema — módulos que não viraram aba, compactos */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-black/[0.06] pt-6">
        <span className="text-xs font-medium text-[oklch(0.5_0.01_48)]">
          E ainda:
        </span>
        {MAIS_MODULOS.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3 py-1.5 text-[13px] font-medium text-[oklch(0.4_0.01_48)]"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Nino AI — seção dedicada (spotlight do consultor de IA) ── */

/** Bolhas de exemplo da conversa (números fictícios, só pra mostrar o tom). */
const NINO_CHAT: { de: "voce" | "nino"; txt: string }[] = [
  { de: "voce", txt: "qual loja vendeu mais esse mês?" },
  {
    de: "nino",
    txt: "A Jardins lidera com R$ 214 mil (34% da rede). A Moema vem logo atrás com R$ 198 mil — e cresceu 12% contra o mês passado, o melhor ritmo entre as suas lojas.",
  },
  { de: "voce", txt: "meu cancelamento tá alto?" },
  {
    de: "nino",
    txt: "Na rede está em 3,8% — dentro da meta. Mas a Vila Mariana está em 6,1% no iFood, quase o dobro. Vale olhar: a maioria é por item em falta.",
  },
]

/** O que dá pra perguntar — agrupado por tema, com exemplos reais de pergunta. */
const NINO_PODERES: { i: LucideIcon; t: string; ex: string }[] = [
  {
    i: TrendingUp,
    t: "Faturamento e vendas",
    ex: "“como está meu faturamento?”, “bati a meta?”",
  },
  {
    i: Scale,
    t: "Comparar lojas",
    ex: "“qual loja vende mais?”, “compare a Moema com a Jardins”",
  },
  {
    i: Coins,
    t: "Taxas, CMV e margem",
    ex: "“quanto pago de taxa no iFood?”, “meu CMV está alto?”",
  },
  {
    i: CalendarClock,
    t: "Histórico do ano",
    ex: "“como foi meu ano até agora?”, “qual foi o melhor mês?”",
  },
  {
    i: Star,
    t: "Avaliações e cancelamento",
    ex: "“minha nota caiu?”, “por que cancelam?”",
  },
  {
    i: Lightbulb,
    t: "Onde focar",
    ex: "“o que devo priorizar essa semana?”",
  },
]

/** Mockup escuro da conversa com o Nino (cartão premium sobre fundo claro). */
function NinoChatMock() {
  return (
    <div className="rounded-3xl border border-black/10 bg-[var(--ink)] p-4 text-white shadow-[0_36px_70px_-30px_oklch(0.65_0.21_35/.45)] sm:p-5">
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand)] text-white">
          <Sparkles className="size-4" strokeWidth={2.6} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Nino</p>
          <p className="text-[11px] text-[oklch(0.68_0.012_60)]">
            Consultor de IA · online
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {NINO_CHAT.map((m, i) =>
          m.de === "voce" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--brand)] px-3.5 py-2 text-sm text-white">
                {m.txt}
              </p>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2 text-sm text-[oklch(0.9_0_0)]">
                {m.txt}
              </p>
            </div>
          ),
        )}
      </div>
      <p className="mt-4 border-t border-white/10 pt-3 text-center text-[11px] text-[oklch(0.6_0_0)]">
        Exemplo ilustrativo · o Nino só responde com os dados da sua conta
      </p>
    </div>
  )
}

/**
 * Conteúdo da aba "IA" — o Nino em destaque (chat de exemplo + o que dá pra
 * perguntar) e, embaixo, o diagnóstico com o plano de ação. Render customizado
 * (não usa o layout padrão de print + bullets das outras abas).
 */
function NinoTabPanel({ tab }: { tab: (typeof PORDENTRO_TABS)[number] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const slide0Ref = useRef<HTMLDivElement>(null)
  const slide1Ref = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState(0)
  const [alturas, setAlturas] = useState<[number, number]>([0, 0])
  const SLIDES = 2

  // A altura do trilho acompanha a tela ativa — senão a tela mais curta
  // (o diagnóstico) deixa um "buraco branco" embaixo. Re-mede no resize e
  // quando o print termina de carregar (ResizeObserver).
  useEffect(() => {
    const medir = () => {
      const a0 = slide0Ref.current?.offsetHeight ?? 0
      const a1 = slide1Ref.current?.offsetHeight ?? 0
      setAlturas((prev) => (prev[0] === a0 && prev[1] === a1 ? prev : [a0, a1]))
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (slide0Ref.current) ro.observe(slide0Ref.current)
    if (slide1Ref.current) ro.observe(slide1Ref.current)
    return () => ro.disconnect()
  }, [])

  const irPara = (i: number) => {
    const el = scrollRef.current
    if (!el) return
    const alvo = Math.max(0, Math.min(SLIDES - 1, i))
    el.scrollTo({ left: alvo * el.clientWidth, behavior: "smooth" })
    setSlide(alvo)
    // Traz o painel de volta pro topo da vista (senão, na troca, a tela some
    // pra cima e sobra tela branca). Usa o Lenis pra não brigar com o scroll.
    const topo = rootRef.current
    if (topo) {
      if (lenisRef.current) lenisRef.current.scrollTo(topo, { offset: -72 })
      else topo.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div id="nino" ref={rootRef} className="rx-tab-in scroll-mt-24">
      <div className="relative">
        {/* Trilho horizontal (2 telas lado a lado, com snap). A altura segue a
            tela ativa pra não sobrar espaço branco. */}
        <div
          ref={scrollRef}
          style={alturas[slide] ? { height: alturas[slide] } : undefined}
          onScroll={(e) =>
            setSlide(
              Math.round(
                e.currentTarget.scrollLeft /
                  Math.max(1, e.currentTarget.clientWidth),
              ),
            )
          }
          className="flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden transition-[height] duration-300 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* ── Tela 1 — o Nino (chat + o que perguntar) ── */}
          <div ref={slide0Ref} className="w-full shrink-0 snap-start px-0.5">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className="order-2 lg:order-1">
                <NinoChatMock />
              </div>
              <div className="order-1 lg:order-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
                  {tab.tag}
                </span>
                <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
                  Seu consultor de delivery, 24 horas por dia
                </h3>
                <p className="mt-2 text-[oklch(0.45_0.01_48)]">
                  Manda a pergunta como mandaria pro seu sócio — e o Nino
                  responde na hora, com os números reais das suas lojas. Um
                  especialista em delivery à sua disposição a qualquer hora: sem
                  planilha, sem relatório, sem esperar o contador.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {NINO_PODERES.map((p) => (
                    <div
                      key={p.t}
                      className="rounded-2xl border border-black/[0.07] bg-white p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                          <p.i className="size-3.5" strokeWidth={2.4} />
                        </span>
                        <p className="text-sm font-semibold">{p.t}</p>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-[oklch(0.5_0.01_48)]">
                        {p.ex}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 flex items-start gap-2 text-[13px] text-[oklch(0.5_0.01_48)]">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                    strokeWidth={2.6}
                  />
                  Franqueado pergunta sobre a própria loja; a holding vê a rede
                  inteira — cada um só enxerga o que é seu.
                </p>
              </div>
            </div>
          </div>

          {/* ── Tela 2 — o diagnóstico com o plano de ação (o print) ── */}
          <div ref={slide1Ref} className="w-full shrink-0 snap-start px-0.5">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className="order-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
                  Todo mês, automático
                </span>
                <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
                  {tab.titulo}
                </h3>
                <p className="mt-2 text-[oklch(0.45_0.01_48)]">
                  Além do chat, a IA cruza tudo sozinha e escreve o diagnóstico
                  da loja com as 3 ações que mais mexem no resultado — o
                  problema, o que está em jogo e como resolver. Você exporta em
                  PDF.
                </p>
                <ul className="mt-4 space-y-2">
                  {tab.bullets.slice(1).map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                        strokeWidth={2.6}
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="order-2">
                <ShotBrowser
                  src={tab.img}
                  alt={tab.titulo}
                  url={tab.url}
                  callout={tab.callout}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Seta flutuante — rola pra próxima tela (some na última) */}
        {slide < SLIDES - 1 && (
          <button
            type="button"
            onClick={() => irPara(slide + 1)}
            aria-label="Ver o diagnóstico"
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 p-3 shadow-[0_12px_28px_-10px_rgba(0,0,0,.3)] backdrop-blur transition-transform hover:scale-105 lg:flex"
          >
            <ChevronRight className="size-5 text-[var(--brand)]" strokeWidth={2.4} />
          </button>
        )}
        {slide > 0 && (
          <button
            type="button"
            onClick={() => irPara(slide - 1)}
            aria-label="Voltar pro Nino"
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 p-3 shadow-[0_12px_28px_-10px_rgba(0,0,0,.3)] backdrop-blur transition-transform hover:scale-105 lg:flex"
          >
            <ChevronLeft className="size-5 text-[var(--brand)]" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* Controles do carrossel: setas + bolinhas (com rótulo da tela) */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => irPara(slide - 1)}
          disabled={slide === 0}
          aria-label="Anterior"
          className="flex size-9 items-center justify-center rounded-full border border-black/10 text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-4" strokeWidth={2.4} />
        </button>
        <div className="flex items-center gap-2">
          {["Nino AI", "Diagnóstico"].map((rotulo, i) => (
            <button
              key={rotulo}
              type="button"
              onClick={() => irPara(i)}
              aria-label={rotulo}
              className={`rounded-full text-xs font-medium transition-all ${
                slide === i
                  ? "bg-[var(--brand-soft)] px-3 py-1.5 text-[var(--brand-strong)]"
                  : "px-3 py-1.5 text-[oklch(0.5_0.01_48)] hover:text-[var(--brand)]"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => irPara(slide + 1)}
          disabled={slide === SLIDES - 1}
          aria-label="Próximo"
          className="flex size-9 items-center justify-center rounded-full border border-black/10 text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}

/** Itens da nav (âncoras) — usados também pelo scrollspy.
 *  `spy: false` → o link rola mas não é observado (evita brigar com a seção
 *  que o contém pelo destaque; caso do Nino, que vive dentro de "O sistema"). */
const NAV_LINKS: { id: string; label: string; ai?: boolean; spy?: boolean }[] = [
  { id: "experimente", label: "Como funciona" },
  { id: "sistema", label: "O sistema" },
  { id: "nino", label: "Nino AI", ai: true, spy: false },
  { id: "precos", label: "Preços" },
  { id: "redes", label: "Redes" },
]

/* Preço dos planos. A BASE é o ANUAL (valor por mês); o mensal custa +30%.
   O anual é cobrado à vista no cartão (12 meses de uma vez, 1 cobrança/ano).
   A regra do +30% vem de @/lib/pricing (fonte única, dividida com o checkout). */

/** Bloco de preço de um card — alterna entre anual (base) e mensal (+30%). */
function PrecoValor({
  mes,
  anual,
  dark = false,
}: {
  mes: number
  anual: boolean
  dark?: boolean
}) {
  const valor = valorMensalExibido(mes, anual ? "anual" : "mensal")
  const muted = dark ? "text-[oklch(0.62_0_0)]" : "text-[oklch(0.5_0.01_48)]"
  const brand = dark ? "text-[oklch(0.82_0.14_55)]" : "text-[var(--brand-strong)]"
  return (
    <div className="relative">
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-5xl font-medium tracking-tight">R$ {precoStr(valor)}</span>
        <span className={`text-sm ${muted}`}>/loja · mês</span>
      </div>
      <p className={`mt-1.5 text-xs font-medium ${brand}`}>
        {anual
          ? `R$ ${precoStr(mes * 12)} à vista no ano · 1 cobrança`
          : `No anual sai por R$ ${precoStr(mes)}/mês`}
      </p>
    </div>
  )
}

/** Instância do Lenis compartilhada, pra rolagens programáticas (ex.: carrossel
 *  do Nino) usarem o mesmo scroll suave em vez de brigar com ele. */
const lenisRef: { current: Lenis | null } = { current: null }

export function LandingV3({
  precos,
}: {
  /** Preços por loja vindos do /plataforma (platform_settings). */
  precos: { essencial: number; pro: number; ai: number }
}) {
  const scrolled = useScrolled(20)
  const [active, setActive] = useState("")
  const [demoResult, setDemoResult] = useState(false)
  const [anual, setAnual] = useState(true)

  // Scrollspy: marca no menu a seção que está em vista.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-15% 0px -80% 0px" },
    )
    NAV_LINKS.forEach((l) => {
      if (l.spy === false) return
      const el = document.getElementById(l.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  // Smooth-scroll "buttery" (Lenis). Respeita prefers-reduced-motion e leva os
  // links âncora (#como, #precos…) com a mesma suavidade.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      lerp: 0.13,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    })
    lenisRef.current = lenis
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
      lenisRef.current = null
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
            <span className={`text-[17px] tracking-tight transition-colors ${scrolled ? "text-[var(--ink)]" : "text-white"}`}>Delivery OS</span>
          </a>
          <div className={`hidden items-center gap-6 text-sm transition-colors md:flex ${scrolled ? "text-[oklch(0.45_0.01_48)]" : "text-white/80"}`}>
            {NAV_LINKS.map((l) => {
              const on = active === l.id
              return (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  className={`inline-flex items-center gap-1 transition-colors ${
                    on
                      ? "font-semibold text-[var(--brand)]"
                      : "hover:text-[var(--brand)]"
                  }`}
                >
                  {l.ai && (
                    <Sparkles
                      className="size-3.5 text-[var(--brand)]"
                      strokeWidth={2.4}
                    />
                  )}
                  {l.label}
                </a>
              )
            })}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="/login"
              className={`text-sm font-medium transition-colors ${scrolled ? "text-[oklch(0.45_0.01_48)] hover:text-[var(--brand)]" : "text-white/85 hover:text-white"}`}
            >
              Entrar
            </a>
            <a href="/cadastro" className="btn-brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium">
              Testar grátis
            </a>
          </div>
        </div>
      </nav>

      {/* ══════════════ ATO 1 — DONO DE LOJA ══════════════ */}

      {/* HERO */}
      <header id="topo" className="relative overflow-hidden bg-[var(--ink)] pb-12 pt-24 sm:pb-16 sm:pt-28 text-white">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-start gap-x-8 px-5 lg:grid-cols-[1fr_1.2fr] lg:gap-x-10">
          {/* Intro — texto (no mobile fica ANTES da tela) */}
          <div className="text-center lg:col-start-1 lg:row-start-1 lg:self-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[oklch(0.85_0.05_60)]">
                <span className="size-1.5 rounded-full bg-[var(--brand)]" />
                Para donos de delivery
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 text-balance text-[2rem] font-medium leading-[1.08] tracking-tight sm:mt-6 sm:text-6xl sm:leading-[1.05]">
                Descomplique os relatórios das plataformas — e veja quanto você{" "}
                <span className="text-[oklch(0.78_0.16_50)]">realmente ganha</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-[oklch(0.78_0.012_60)] sm:text-lg lg:mx-0">
                Cada plataforma manda uma planilha diferente. Você sobe, a gente
                lê todas e mostra o lucro real de cada loja e cada plataforma. Na
                hora, sem cadastro, sem senha.
              </p>
            </Reveal>
          </div>

          {/* Tela (print) — no mobile ENTRE o texto e os botões; no desktop, coluna da direita */}
          <Reveal
            delay={420}
            y={40}
            className="mt-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center"
          >
            <div className="relative w-full">
              <div className="glow-blob left-1/2 top-1/2 h-[115%] w-[115%] -translate-x-1/2 -translate-y-1/2 opacity-90" />
              <div className="relative rounded-[20px] bg-white/10 p-1.5 shadow-[0_50px_100px_-30px_rgba(0,0,0,.8)] ring-1 ring-white/15">
                <Shot src="/landing/dre.png" alt="Resultado da sua loja no Delivery OS" />
              </div>
              <p className="relative mt-4 text-center text-xs text-[oklch(0.62_0.01_60)] lg:text-left">
                A sua loja — faturamento, taxas e o que sobra em cada plataforma.
              </p>
            </div>
          </Reveal>

          {/* Botões + garantia (no mobile, DEPOIS da tela) */}
          <div className="mt-8 text-center lg:col-start-1 lg:row-start-2 lg:mt-9 lg:text-left">
            <Reveal delay={240}>
              <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
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
        </div>
      </header>

      {/* LOGOS */}
      <section className="border-y border-black/5 bg-white py-7">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.01_48)]">
              Sem senha · sem conectar nada · você só sobe o relatório de
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {(["ifood", "99food", "keeta"] as PlatId[]).map((id) => (
                <span key={id} className={`lift inline-flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-[15px] font-medium ${PLAT_ACCENT[id].card}`}>
                  <PlatLogo id={id} size={28} className="rounded-lg shadow-[0_6px_14px_-5px_rgba(0,0,0,.4)] ring-2 ring-white" />
                  {PLAT_LABEL[id]}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ★ TESTE GRÁTIS — 2ª dobra (demo ao vivo, no navegador) */}
      <section id="experimente" className="relative overflow-hidden bg-white pb-12 pt-10 sm:pt-14">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob left-1/2 top-8 h-72 w-[40rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-6xl px-5">
          <div
            className={`grid items-center gap-8 lg:gap-14 ${
              demoResult ? "" : "lg:grid-cols-2"
            }`}
          >
            {/* Demo / resultado — largura total quando tem resultado */}
            <Reveal
              delay={220}
              className={demoResult ? "" : "order-2 lg:order-1"}
            >
              <ExperimenteDemo sample onResultChange={setDemoResult} />
            </Reveal>

            {/* Texto + reversão de risco — some quando o resultado aparece */}
            <div className={`order-1 lg:order-2 ${demoResult ? "hidden" : ""}`}>
              <Reveal>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--brand)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white">
                  <Zap className="size-3.5" strokeWidth={2.6} />
                  Teste grátis · sem cadastro · sem senha
                </span>
              </Reveal>
              <Reveal delay={70}>
                <h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl">
                  Suba a sua planilha e veja seu{" "}
                  <span className="text-[var(--brand)]">lucro</span> real
                </h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="mt-4 max-w-lg text-[oklch(0.5_0.01_48)]">
                  Baixa o relatório do iFood, 99 Food ou Keeta, joga aqui do lado e
                  veja na hora quanto as taxas comem e o que de fato entra na sua
                  conta.
                </p>
              </Reveal>

              <Reveal delay={180}>
                <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[oklch(0.65_0.21_35/.25)] bg-[var(--brand-soft)] px-4 py-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--brand-strong)] shadow-sm">
                    <ShieldCheck className="size-5" strokeWidth={2.2} />
                  </span>
                  <p className="text-sm font-medium text-[var(--brand-strong)]">
                    Veja o resultado antes de dar qualquer dado.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-[oklch(0.5_0.01_48)]">
                    Arraste sua planilha ao lado — ou use o botão{" "}
                    <span className="font-medium text-[oklch(0.35_0.01_48)]">
                      &ldquo;planilha de exemplo&rdquo;
                    </span>{" "}
                    logo abaixo da caixa.
                  </span>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* DORES — número gigante + barra + 3 cards, compacto (cabe numa tela) */}
      <section className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-balance text-center text-3xl font-medium tracking-tight sm:text-4xl">
            Você sabe quanto <span className="text-[var(--brand)]">sobra</span> de verdade?
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-6 text-center">
            <p className="text-5xl font-semibold tracking-tight text-[var(--brand)] sm:text-6xl">
              R$ 45
            </p>
            <p className="mx-auto mt-2.5 max-w-md text-[15px] text-[oklch(0.5_0.01_48)]">
              de cada R$ 100 podem sumir em taxas, entrega e promoção antes de
              virar lucro. Sem o número real, é tudo no achismo.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120} y={36}>
          <div className="mx-auto mt-7 max-w-3xl">
            <PainBreakdown />
          </div>
        </Reveal>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {DORES.map((d, i) => (
            <Reveal key={d.titulo} delay={i * 110}>
              <div className="lift h-full rounded-2xl border border-black/[0.07] bg-white p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[oklch(0.95_0.04_30)] text-[var(--brand-strong)]">
                  <d.icon className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-3 text-lg font-medium">{d.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.5_0.01_48)]">{d.texto}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#experimente" className="btn-brand grp inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium">
              <Upload className="size-[18px]" strokeWidth={2.2} />
              Quero ver quanto sobra pra mim
              <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
            </a>
            <a href="#precos" className="btn-ghost inline-flex items-center gap-2 rounded-full border border-black/10 px-6 py-3 text-[15px] font-medium hover:bg-black/[0.02]">
              Ver planos e preços
            </a>
          </div>
        </Reveal>
      </section>

      {/* COBERTURA — o que o sistema lê de cada plataforma (não é tutorial de
          download: isso já está no teste acima e no guia dentro do sistema) */}
      <section id="relatorios" className="border-y border-black/[0.06] bg-[oklch(0.975_0.02_55)] py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-sm font-medium text-[var(--brand)]">
              O que o sistema lê
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-2 text-balance text-center text-3xl font-medium tracking-tight sm:text-4xl">
              Cada plataforma fala uma língua. O sistema lê{" "}
              <span className="text-[var(--brand)]">todas</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[oklch(0.5_0.01_48)]">
              iFood, 99 Food e Keeta entregam relatórios diferentes. O Delivery OS
              entende cada um e junta tudo num painel só — e a lista só cresce.
            </p>
          </Reveal>

          {/* Cobertura — os 3 lado a lado (iFood maior). Logo centralizado e
              "saltando" pra fora do topo do card. */}
          <div className="mt-16 grid gap-5 md:grid-cols-[1.5fr_1fr_1fr]">
            {RELATORIOS.map((r, i) => {
              const featured = r.id === "ifood"
              return (
                <Reveal key={r.id} delay={i * 90}>
                  <div className={`lift relative h-full rounded-2xl border bg-white px-6 pb-6 pt-14 text-center ${PLAT_ACCENT[r.id].card}`}>
                    {/* logo flutuante — centralizado e pra fora do topo */}
                    <PlatLogo
                      id={r.id}
                      size={featured ? 60 : 48}
                      className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-[0_14px_30px_-8px_rgba(0,0,0,.4)] ring-4 ring-white"
                    />
                    <p className={`font-medium leading-tight ${featured ? "text-lg" : ""}`}>
                      {PLAT_LABEL[r.id]}
                    </p>
                    <p className="mt-0.5 text-xs text-[oklch(0.55_0.01_48)]">
                      {PLAT_SUB[r.id]}
                    </p>
                    <span className={`mt-2.5 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${PLAT_ACCENT[r.id].chip}`}>
                      {r.itens.length} relatórios
                    </span>
                    <ul
                      className={`mt-5 space-y-2.5 text-left ${
                        featured
                          ? "sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2.5 sm:space-y-0"
                          : ""
                      }`}
                    >
                      {r.itens.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm text-[oklch(0.4_0.01_48)]"
                        >
                          <Check
                            className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                            strokeWidth={2.6}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={100}>
            <p className="mx-auto mt-8 max-w-2xl text-balance text-center text-[15px] leading-relaxed text-[oklch(0.4_0.01_48)]">
              O Delivery OS lê <span className="font-semibold text-[oklch(0.28_0.01_48)]">todos</span> os
              relatórios que cada plataforma oferece. 99 e Keeta têm menos porque
              disponibilizam menos — o iFood simplesmente abre mais dados.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-6 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-[oklch(0.65_0.21_35/.4)] bg-[var(--brand-soft)] px-4 py-2 text-sm font-medium text-[var(--brand-strong)]">
                <Zap className="size-4" strokeWidth={2.2} />
                Novos relatórios e plataformas chegando
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* POR DENTRO DO SISTEMA â 1 seÃ§Ã£o com abas (Financeiro / IA / Caixa Pro).
          Funde as antigas "Veja por dentro" + IA + Pro num bloco sÃ³: menos
          rolagem, sobretudo no mobile (1 aba por vez). */}
      <section id="sistema" className="relative overflow-hidden bg-white py-12 sm:py-16">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob -left-28 top-44 h-80 w-80" />
        <div className="glow-blob -right-28 bottom-44 h-80 w-80" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--brand)]">
              Veja por dentro
            </p>
            <h2 className="mt-2 text-center text-3xl font-medium tracking-tight sm:text-4xl">
              Telas feitas pra dono de loja, não pra contador
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[oklch(0.45_0.01_48)]">
              Toque no que interessa — o financeiro da loja, a IA que monta o
              plano, ou o fluxo de caixa completo.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-8 block">
            <PorDentroTabs />
          </Reveal>
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="relative overflow-hidden bg-white py-12 sm:py-16">
        <div className="dot-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="glow-blob left-1/2 top-10 h-72 w-[44rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="text-center text-4xl font-medium tracking-tight sm:text-5xl">
              Escolha o seu <span className="text-[var(--brand)]">plano</span>
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mt-3 text-center text-[oklch(0.5_0.01_48)]">Por loja. No mensal, cancela quando quiser; no anual, você paga à vista e evita os 30% a mais.</p>
          </Reveal>

          {/* Toggle Mensal / Anual */}
          <Reveal delay={100}>
            <div className="mt-7 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setAnual(true)}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    anual
                      ? "bg-[var(--brand)] text-white"
                      : "text-[oklch(0.45_0.01_48)] hover:text-[oklch(0.25_0.01_48)]"
                  }`}
                >
                  Anual
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      anual ? "bg-white/20 text-white" : "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                    }`}
                  >
                    melhor preço
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnual(false)}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    anual
                      ? "text-[oklch(0.45_0.01_48)] hover:text-[oklch(0.25_0.01_48)]"
                      : "bg-[var(--brand)] text-white"
                  }`}
                >
                  Mensal
                </button>
              </div>
              <p className="text-xs text-[oklch(0.5_0.01_48)]">
                Anual = 1 cobrança à vista no cartão, sem os 30% a mais do mensal.
              </p>
            </div>
          </Reveal>

          <div className="mx-auto mt-10 grid items-stretch gap-6 md:grid-cols-3">
            {/* ESSENCIAL */}
            <Reveal delay={120}>
              <div className="lift relative flex h-full flex-col overflow-hidden rounded-3xl border border-black/[0.09] bg-white p-7">
                <span className="absolute right-6 top-6 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-strong)]">Comece aqui</span>
                <h3 className="text-lg font-medium">Essencial</h3>
                <p className="mt-1 text-sm text-[oklch(0.5_0.01_48)]">Pra ver seu lucro no delivery</p>
                <PrecoValor mes={precos.essencial} anual={anual} />
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
                <PrecoValor mes={precos.pro} anual={anual} />
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
                <PrecoValor mes={precos.ai} anual={anual} dark />
                <p className="relative mt-5 text-[13px] font-medium text-[oklch(0.8_0.12_55)]">Tudo do Pro, e mais:</p>
                <ul className="relative mt-3 space-y-3 text-[15px] text-[oklch(0.88_0_0)]">
                  {[
                    { i: Sparkles, t: "Nino AI: consultor que responde na hora — compara lojas, taxas, CMV e o ano inteiro" },
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

          {/* Urgência honesta (sem contador falso) */}
          <Reveal delay={200}>
            <div className="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-3 rounded-2xl border border-[oklch(0.65_0.21_35/.2)] bg-[var(--brand-soft)] px-5 py-4 text-center">
              <TrendingUp className="hidden size-5 shrink-0 text-[var(--brand-strong)] sm:block" strokeWidth={2.2} />
              <p className="text-sm font-medium text-[var(--brand-strong)]">
                Cada mês sem ver o lucro real é um mês de taxa que você não renegociou.
              </p>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-[oklch(0.5_0.01_48)]">
              Comece no Essencial e veja seu lucro hoje. Suba pro Pro pra rodar todo o financeiro da operação — ou pro DeliveryOS AI pra ter a inteligência que lê a loja e escreve o plano de ação todo mês.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ DIVISOR — MUDA DE PÚBLICO ══════════════ */}
      <section id="redes" className="relative overflow-hidden bg-[var(--ink)] py-16 sm:py-20 text-center text-white">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-3xl px-5">
          <Reveal>
            <span className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[oklch(0.85_0.08_60)]">
              <Building2 className="size-3.5 text-[var(--brand)]" strokeWidth={2.4} />
              Para redes e franqueadores
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-5 text-balance text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Tem mais de uma <span className="text-[var(--brand)]">loja</span>?
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-4 max-w-lg text-[oklch(0.78_0.012_60)]">
              A partir daqui o assunto muda: um painel feito pra quem olha a rede
              inteira, não uma loja só.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ ATO 2 — REDE / FRANQUEADOR ══════════════ */}
      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[oklch(0.975_0.02_55)] py-12 sm:py-16">
        <div className="glow-blob -right-24 top-6 h-72 w-72" />
        <div className="glow-blob -left-24 bottom-6 h-72 w-72" />
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal>
            <h3 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
              Todas as lojas num <span className="text-[var(--brand)]">painel</span> só
            </h3>
          </Reveal>
          <Reveal delay={80}>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[oklch(0.5_0.01_48)]">
              Você sobe os arquivos de cada unidade; o sistema consolida a rede
              inteira — ranking, DRE do grupo e o resultado somado, sem abrir uma
              planilha.
            </p>
          </Reveal>

          {/* Bento: print grande full-width em cima + 3 cards numa linha embaixo
              (evita o vazio branco de esticar coluna pra igualar altura) */}
          <Reveal y={36}>
            <div className="lift mt-12 overflow-hidden rounded-3xl border border-black/[0.07] bg-white p-2 shadow-[0_30px_60px_-34px_rgba(40,20,10,.45)]">
              <Shot
                src="/landing/dashboard.png"
                alt="Painel da rede no Delivery OS — todas as lojas consolidadas"
              />
              <p className="px-4 py-4 text-sm text-[oklch(0.5_0.01_48)]">
                O painel da rede — faturamento, taxas e lucro de todas as lojas, consolidados.
              </p>
            </div>
          </Reveal>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {REDE.map((r, i) => (
              <Reveal key={r.t} delay={i * 90}>
                <div className="lift flex h-full flex-col rounded-3xl border border-black/[0.07] bg-white p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                    <r.icon className="size-5" strokeWidth={2} />
                  </span>
                  <p className="mt-3 flex flex-wrap items-center gap-2 font-medium">
                    {r.t}
                    {r.tag ? (
                      <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
                        {r.tag}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.5_0.01_48)]">{r.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Hub de relatórios da rede + financeiro multi-loja */}
          <Reveal delay={120} y={36}>
            <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div className="hidden sm:block">
                <Shot
                  src="/landing/relatorios.png"
                  alt="Hub de relatórios da rede no Delivery OS"
                />
              </div>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-strong)]">
                  <Wallet className="size-3.5" strokeWidth={2.4} />
                  Financeiro da rede
                </span>
                <h4 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
                  A rede inteira vira relatório pronto
                </h4>
                <p className="mt-3 text-[oklch(0.45_0.02_45)]">
                  Comparativo entre lojas, ranking, evolução e ROI de campanha — e
                  o financeiro multi-loja, com o caixa de cada unidade e o
                  consolidado do grupo, num hub só.
                </p>
                <ul className="mt-5 space-y-2.5 text-[15px]">
                  {[
                    "DRE do grupo e resultado somado da operação",
                    "Comparativo e ranking entre todas as lojas",
                    "Caixa de cada unidade, lado a lado",
                  ].map((f) => (
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

          {/* CTA rede — fale conosco */}
          <Reveal delay={160} y={32}>
            <div className="relative mx-auto mt-14 max-w-3xl overflow-hidden rounded-3xl border border-[oklch(0.65_0.21_35/.25)] bg-gradient-to-br from-[var(--brand-soft)] via-white to-white p-7 text-center shadow-[0_30px_60px_-34px_oklch(0.65_0.21_35/.5)] sm:p-9">
              <div className="glow-blob -right-16 -top-16 h-56 w-56" />
              <div className="relative">
                <h4 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  Preço sob medida pra sua rede
                </h4>
                <p className="mx-auto mt-2 max-w-lg text-[oklch(0.45_0.02_45)]">
                  Quanto mais lojas, melhor a conta. Fala com a gente e a gente
                  monta o plano da sua operação.
                </p>
                <a
                  href="mailto:suporte@deliveryos.food?subject=Sou%20franqueador%20—%20quero%20conhecer%20o%20plano%20rede"
                  className="btn-brand grp mt-6 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-medium"
                >
                  <Mail className="size-[18px]" strokeWidth={2.2} />
                  Fale conosco
                  <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ RODAPÉ COMUM ══════════════ */}

      {/* AUTORIDADE — 1 faixa compacta */}
      <section className="border-b border-black/[0.06] bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
            <Reveal>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
                  <Zap className="size-3.5" strokeWidth={2.4} />
                  Testado no fogo
                </span>
                <h2 className="mt-4 text-balance text-2xl font-medium tracking-tight sm:text-3xl">
                  Feito por quem <span className="text-[var(--brand)]">vive</span> de delivery — não por quem só programa
                </h2>
                <p className="mt-3 text-[oklch(0.5_0.01_48)]">
                  O Delivery OS nasceu na operação — anos fechando delivery,
                  apanhando das taxas e com relação direta com quem lidera as
                  plataformas. É a ferramenta que a gente queria ter e não achou.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-black/[0.07] bg-[var(--cream)] p-4">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[oklch(0.95_0.04_30)] text-[var(--brand-strong)]">
                    <Store className="size-4" strokeWidth={2} />
                  </span>
                  <p className="mt-2.5 text-sm font-medium">Donos de delivery</p>
                  <p className="mt-1 text-xs text-[oklch(0.5_0.01_48)]">Não uma software house.</p>
                </div>
                <div className="rounded-2xl border border-black/[0.07] bg-[var(--cream)] p-4">
                  <div className="flex items-center gap-1.5">
                    {(["ifood", "99food", "keeta"] as PlatId[]).map((id) => (
                      <PlatLogo key={id} id={id} size={24} className="rounded-md shadow-[0_4px_10px_-4px_rgba(0,0,0,.4)] ring-2 ring-white" />
                    ))}
                  </div>
                  <p className="mt-2.5 text-sm font-medium">Por dentro das plataformas</p>
                  <p className="mt-1 text-xs text-[oklch(0.5_0.01_48)]">Regras de cada uma, por dentro.</p>
                </div>
                <div className="rounded-2xl border border-black/[0.07] bg-[var(--cream)] p-4 sm:col-span-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[oklch(0.95_0.04_30)] text-[var(--brand-strong)]">
                    <Network className="size-4" strokeWidth={2} />
                  </span>
                  <p className="mt-2.5 flex flex-wrap items-center gap-2 text-sm font-medium">
                    Aberto pra integrar
                    <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
                      API aberta
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[oklch(0.5_0.01_48)]">As 3 grandes integradas — e uma API pra novas plataformas e ERP.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* QUEM JÁ USA — depoimentos (placeholder) */}
      <section className="border-b border-black/[0.06] bg-[oklch(0.975_0.02_55)] py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <h2 className="text-center text-2xl font-medium tracking-tight sm:text-3xl">
              Quem já <span className="text-[var(--brand)]">usa</span>
            </h2>
          </Reveal>
          {/* PLACEHOLDER: cliente real, não inventar */}
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {DEPOIMENTOS.map((d, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="h-full rounded-2xl border border-dashed border-black/[0.12] bg-white p-6">
                  <p className="text-[oklch(0.4_0.02_45)]">“{d.texto}”</p>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="size-10 shrink-0 rounded-full bg-[oklch(0.9_0.005_60)]" />
                    <div>
                      <p className="text-sm font-medium text-[oklch(0.45_0.01_48)]">{d.nome}</p>
                      <p className="text-xs text-[oklch(0.55_0.01_48)]">{d.loja}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SEGURANÇA — faixa escura (destaque) com selos */}
      <section id="seguranca" className="relative overflow-hidden border-y border-white/10 bg-[var(--ink2)] py-12 text-white">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="glow-blob left-1/2 top-0 h-40 w-[36rem] -translate-x-1/2" />
        <div className="relative mx-auto max-w-6xl px-5">
          {/* cabeçalho — destaque */}
          <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:gap-5 lg:text-left">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-[0_14px_30px_-14px_oklch(0.65_0.21_35/.9)]">
              <ShieldCheck className="size-6" strokeWidth={1.9} />
            </span>
            <div>
              <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
                Segurança de dados a gente leva a sério
              </h2>
              <p className="mt-1.5 text-sm text-white/60">
                Você não dá senha nem conecta nada. Seus dados ficam só na sua conta — e você apaga quando quiser.
              </p>
            </div>
          </div>

          {/* 4 pontos — ícone + texto (feature, não pílula: não confunde com link) */}
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {TRUST.map((b) => (
              <div key={b.t} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[var(--brand)]">
                  <b.icon className="size-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium text-white/85">{b.t}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-6 lg:justify-end">
            <a
              href="/seguranca"
              className="grp inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/90 transition-colors hover:border-white/35 hover:bg-white/10 hover:text-white"
            >
              <ShieldCheck className="size-4 text-[var(--brand)]" strokeWidth={2.2} />
              Como protegemos seus dados
              <ArrowRight className="arrow-slide size-3.5" strokeWidth={2.4} />
            </a>
            <a
              href="/privacidade"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/75 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white/70"
            >
              Política de Privacidade
              <ArrowUpRight className="size-3.5" strokeWidth={2.4} />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[var(--cream)] py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">Perguntas frequentes</h2>
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 sm:items-start">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 50}>
                <FaqItem q={f.q} a={f.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL — voz dono de loja */}
      <section className="relative overflow-hidden bg-[var(--ink)] py-12 sm:py-16 text-center text-white">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-2xl px-5">
          <Reveal>
            <h2 className="text-balance text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
              Pare de adivinhar.
              <br />
              Comece a enxergar o lucro da sua loja.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-4 max-w-md text-[oklch(0.78_0.012_60)]">
              Sobe a sua planilha e veja em minutos se está ganhando de verdade em cada plataforma.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <a href="#experimente" className="btn-brand grp mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-medium">
              <Upload className="size-5" strokeWidth={2.2} />
              Subir minha planilha grátis
              <ArrowRight className="arrow-slide size-5" strokeWidth={2.2} />
            </a>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-5 text-xs text-[oklch(0.65_0.01_60)]">
              Sem cartão pra testar · 7 dias grátis · cancele quando quiser
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-[oklch(0.72_0.012_60)]">
              <a
                href="https://instagram.com/deliveryos.food"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <IgIcon className="size-4" />
                @deliveryos.food
              </a>
              <a
                href="mailto:contato@deliveryos.food"
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <Mail className="size-4" strokeWidth={2} />
                contato@deliveryos.food
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[var(--ink2)] py-8 pb-24 text-white/70 sm:pb-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row">
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <div className="flex items-center gap-2 font-medium text-white">
              <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
                <BarChart3 className="size-4" strokeWidth={2.4} />
              </span>
              Delivery OS
            </div>
            <div className="flex items-center gap-2.5">
              <a
                href="https://instagram.com/deliveryos.food"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 transition-colors hover:bg-white/5 hover:text-white"
              >
                <IgIcon className="size-4" />
              </a>
              <a
                href="mailto:contato@deliveryos.food"
                aria-label="E-mail"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Mail className="size-4" strokeWidth={2} />
              </a>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <a href="/seguranca" className="transition-colors hover:text-white">Segurança</a>
            <a href="/privacidade" className="transition-colors hover:text-white">Política de Privacidade</a>
            <a href="/termos" className="transition-colors hover:text-white">Termos de Uso</a>
          </nav>
          <p className="text-xs text-white/50">© 2026 Delivery OS · deliveryos.food</p>
        </div>
      </footer>

      {/* CTA FIXO — só mobile. Leva pro cadastro (teste grátis) pra converter. */}
      <a
        href="/cadastro"
        className="btn-brand grp fixed inset-x-3 bottom-3 z-40 flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold sm:hidden"
      >
        Testar grátis · 7 dias
        <ArrowRight className="arrow-slide size-[18px]" strokeWidth={2.2} />
      </a>
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
