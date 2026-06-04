import type { NextConfig } from "next";

// Headers de segurança aplicados a todas as respostas (hardening).
// Conjunto conservador — sem CSP estrita, pra não quebrar Next/Supabase.
const securityHeaders = [
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
