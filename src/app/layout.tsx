import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.deliveryos.food"),
  title: "Delivery OS",
  description: "O sistema operacional do seu delivery — iFood, 99 Food e Keeta num lugar só.",
  // PWA: sem estes o iPhone instala com print da tela em vez de ícone, e abre
  // com a barra do Safari por cima — parece site salvo, não aplicativo.
  manifest: "/manifest.webmanifest",
  applicationName: "Delivery OS",
  appleWebApp: {
    capable: true,
    title: "Delivery OS",
    // "default", NÃO "black-translucent".
    //
    // Translúcido faz o iOS desenhar o app POR BAIXO da barra de status — o
    // relógio e a bateria ficam por cima do conteúdo, e o botão do menu, que
    // mora no topo, vira inclicável. Foi exatamente o que aconteceu no
    // primeiro teste do PWA no iPhone. Com "default" o sistema reserva a
    // faixa: perde-se a tela de ponta a ponta, ganha-se um app usável.
    statusBarStyle: "default",
  },
  icons: {
    icon: "/deliveryos-icon.png",
    apple: "/deliveryos-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff4d1c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        {/* Web Analytics da Vercel — incluso no plano, custo 0. Conta
            visitas/páginas de toda a app (landing, login e telas internas). */}
        <Analytics />
      </body>
    </html>
  );
}
