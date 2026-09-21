import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
export const metadata: Metadata = {
  title: "A tua primeira Jola",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="main" className="container checkout-loading">
          A preparar a tua noite…
        </main>
      }
    >
      <CheckoutFlow />
    </Suspense>
  );
}
