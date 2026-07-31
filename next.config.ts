import type { NextConfig } from "next";
import path from "node:path";

// Content-Security-Policy — só em produção (em dev o HMR do Next usa eval/ws e
// quebraria). script/style com 'unsafe-inline' porque o Next injeta scripts/
// estilos inline sem nonce; mesmo assim o CSP fecha buracos reais: limita pra
// onde o app pode conectar (só Supabase + APIs de CEP/CNPJ), bloqueia embed em
// iframe de terceiros, <object>/<embed>, injeção de <base> e destino de forms.
// challenges.cloudflare.com = Turnstile (anti-bot do login): precisa carregar
// o script, abrir o iframe do desafio e conversar com o Cloudflare. Sem estas
// 3 liberações o widget falha CALADO em produção e ninguém entra.
const TURNSTILE = "https://challenges.cloudflare.com"

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https://*.supabase.co", // vídeos tutoriais (Storage)
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br https://brasilapi.com.br ${TURNSTILE}`,
  `frame-src 'self' ${TURNSTILE}`,
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

// Headers de segurança aplicados a todas as respostas (hardening).
const securityHeaders = [
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: csp }]
    : []),
  // Clickjacking: não deixa o app ser embutido em iframe de outra origem.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Anti MIME-sniffing: o browser respeita o content-type declarado.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Vaza o mínimo de referrer pra fora do domínio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs do navegador que o app não usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Força HTTPS (só vale em https; ignorado em localhost).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  /**
   * Trava a raiz do projeto.
   *
   * O Turbopack descobre a raiz sozinho procurando o lockfile mais alto na
   * árvore de pastas. Em 30/jul/26 um `npm install` rodado sem entrar na pasta
   * do projeto criou um package-lock.json solto em ~/, e o Turbopack elegeu a
   * pasta pessoal inteira como raiz — passando a vigiar ~300 mil arquivos
   * (só o ~/Library tem 277k, e é onde todo app do Mac escreve cache sem
   * parar). O processo do node inflou até 4,5 GB e o macOS começou a matar
   * aplicativos por falta de memória (jetsam).
   *
   * Fixando a raiz aqui, um lockfile perdido lá fora não muda mais nada.
   */
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // XLSX do iFood pode chegar a vários MB (Financeiro tem 11k linhas).
      bodySizeLimit: "30mb",
    },
  },
  /**
   * Endereços antigos continuam funcionando.
   *
   * As três telas trocaram de URL porque o endereço tinha ficado com o nome
   * de quando a tela nasceu, não com o nome que ela tem hoje no menu:
   *   /financeiro    era o "DRE Grupo"      → /dre
   *   /caixa         era o "Financeiro"     → /financeiro
   *   /consultor-ia  virou "Nino AI"        → /nino
   *
   * Permanente (308) porque a mudança é definitiva e assim o navegador para de
   * bater no endereço velho. Os `:path*` levam junto as subpáginas — sem eles,
   * /caixa/fluxo e as outras seis abas do financeiro morreriam em 404.
   */
  async redirects() {
    return [
      // ⚠️ Antes da regra genérica de /caixa/:path*: o aging trocou de nome
      // junto com a pasta, então a genérica mandaria pra um endereço morto.
      { source: "/caixa/aging", destination: "/financeiro/a-pagar-receber", permanent: true },
      { source: "/caixa", destination: "/financeiro", permanent: true },
      { source: "/caixa/:path*", destination: "/financeiro/:path*", permanent: true },
      { source: "/consultor-ia", destination: "/nino", permanent: true },
      { source: "/consultor-ia/:path*", destination: "/nino/:path*", permanent: true },
      { source: "/plataforma", destination: "/clientes", permanent: true },
      { source: "/plataforma/:path*", destination: "/clientes/:path*", permanent: true },
      { source: "/financeiro/aging", destination: "/financeiro/a-pagar-receber", permanent: true },
    ]
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
