import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { PaymentCheckout } from "@/components/checkout/payment-checkout";
import { sandboxRequested } from "@/lib/server/payment-config";
import { connection } from "next/server";
export const metadata: Metadata = {
  title: "A tua primeira Ruvon",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ interesse?: string }>;
}) {
  await connection();
  const params = await searchParams;
  return (
    <Suspense
      fallback={
        <main id="main" className="container checkout-loading">
          A preparar a tua noite…
        </main>
      }
    >
      {sandboxRequested() && params.interesse !== "1" ? (
        <PaymentCheckout />
      ) : (
        <CheckoutFlow />
      )}
    </Suspense>
  );
}
