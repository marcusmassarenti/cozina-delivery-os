import type { NextConfig } from "next";

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
  experimental: {
    serverActions: {
      // XLSX do iFood pode chegar a vários MB (Financeiro tem 11k linhas).
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
