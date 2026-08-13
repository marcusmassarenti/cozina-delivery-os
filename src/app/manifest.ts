import type { MetadataRoute } from "next"

/**
 * PWA: o Delivery OS instalável na tela de início.
 *
 * Não é enfeite — é o que destrava o PUSH no iPhone. O iOS só entrega
 * notificação web pra site que foi adicionado à tela de início, e é a
 * notificação (o "ontem sua rede fez X, a loja Y caiu 22%") que traz o dono do
 * delivery pro produto todo dia sem ele lembrar de entrar.
 *
 * `start_url` aponta pro /inicio, não pra raiz: a raiz é a landing de vendas.
 * Quem instalou já é cliente — abrir a página de vendas pra ele seria o mesmo
 * erro que a gente corrigiu no redirecionamento do login.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Delivery OS",
    short_name: "Delivery OS",
    description:
      "O sistema operacional do seu delivery — iFood, 99 Food, Keeta e Cardápio Web num lugar só.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: "#ffffff",
    theme_color: "#ff4d1c",
    icons: [
      {
        src: "/deliveryos-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/deliveryos-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
