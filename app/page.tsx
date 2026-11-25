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
      {/* cofounder:homepage-campaign */}
      <aside data-cofounder-campaign={"cmwwk5kss01av4mygx4tgexef"} className="container" style={{ paddingBlock: "1rem" }}><strong>{"Está a planear um convívio em casa? Explore packs de bebidas e artigos para a festa."}</strong>{" "}<a href={"/growth/cmwwk5kss01av4mygx4tgexef?utm_source=website&utm_medium=owned&utm_campaign=cmwwk5kss01av4mygx4tgexef"} style={{ color: "inherit", textDecoration: "underline" }}>{"Ver os detalhes"}</a></aside>
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
