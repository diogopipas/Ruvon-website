import { Suspense } from "react";
import { Catalog } from "@/components/ordering/catalog";
import { LandingView } from "@/components/landing/landing-actions";
import { CommerceCheckout } from "@/components/checkout/commerce-checkout";
import { getAmoPilotProducts } from "@/lib/server/amo-pilot-catalog";
import {
  commerceEnvironment,
  commerceExposed,
} from "@/lib/server/commerce-config";

export default function Home() {
  return (
    <>
      <LandingView />
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
          <Catalog home amoProducts={getAmoPilotProducts()} />
        )}
      </Suspense>
    </>
  );
}
