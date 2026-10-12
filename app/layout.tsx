import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ValidationAnalytics } from "@/components/analytics/validation-analytics";
import { Providers } from "@/components/providers";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./styles/merchant.css";
import { CartLayer } from "@/components/cart/cart";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { sandboxRequested } from "@/lib/server/payment-config";
import { connection } from "next/server";
import { commerceExposed } from "@/lib/server/commerce-config";
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
  metadataBase: getSiteUrl(),
  title: { default: "Ruvon — Bebidas e gelo à porta", template: "%s · Ruvon" },
  description:
    "Acabou a bebida? Ruvon leva cerveja gelada, gelo, mixers, snacks e tudo o que falta para salvar a noite.",
  openGraph: {
    title: "Acabou a bebida? Nós levamos. | Ruvon",
    description:
      "Cerveja gelada, gelo, mixers e snacks. Não vás buscar. Pede. Em breve, zona a zona.",
    locale: "pt_PT",
    type: "website",
    siteName: "Ruvon",
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
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sandbox = sandboxRequested();
  const commerce = commerceExposed();
  const privateCommerce =
    commerce || process.env.RUVON_PAYMENTS_MODE === "live";
  if (sandbox) await connection();
  return (
    <html
      lang="pt-PT"
      className={`${display.variable} ${body.variable}`}
      data-ruvon-mode={
        commerce ? "commerce" : sandbox ? "sandbox" : "validation"
      }
    >
      <body>
        <a href="#main" className="skip-link">
          Saltar para o conteúdo
        </a>
        <Providers sandbox={sandbox} commerce={commerce}>
          {children}
          {!commerce && <CartLayer />}
          {!sandbox && !privateCommerce && <MetaPixel />}
        </Providers>
        {!sandbox && !privateCommerce && <ValidationAnalytics />}
      </body>
    </html>
  );
}
