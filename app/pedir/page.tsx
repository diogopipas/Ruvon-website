import { Suspense } from "react";
import type { Metadata } from "next";
import { Catalog } from "@/components/ordering/catalog";
import {
  commerceEnvironment,
  commerceExposed,
} from "@/lib/server/commerce-config";
import { CommerceCheckout } from "@/components/checkout/commerce-checkout";
export const metadata: Metadata = { title: "O que te falta?" };
export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          className="catalog-skeleton container"
          role="status"
          aria-label="A preparar o catálogo"
        >
          <div />
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      }
    >
      {commerceExposed() ? (
        <CommerceCheckout environment={commerceEnvironment()} />
      ) : (
        <Catalog />
      )}
    </Suspense>
  );
}
