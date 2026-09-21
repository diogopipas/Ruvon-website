import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";
import { CartLayer } from "@/components/cart/cart";
const display = localFont({
  src: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
  variable: "--font-display",
  display: "swap",
});
const body = localFont({
  src: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2",
  variable: "--font-body",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: { default: "Jola — Bebidas e gelo à porta", template: "%s · Jola" },
  description:
    "Acabou a bebida? Jola leva cerveja gelada, gelo, mixers, snacks e tudo o que falta para salvar a noite.",
  openGraph: {
    title: "Acabou a bebida? Nós levamos. | Jola",
    description:
      "Cerveja gelada, gelo, mixers e snacks. Não vás buscar. Pede. Em breve em Lisboa.",
    locale: "pt_PT",
    type: "website",
    siteName: "Jola",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171815",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Saltar para o conteúdo
        </a>
        <Providers>
          {children}
          <CartLayer />
        </Providers>
      </body>
    </html>
  );
}
