import { Suspense } from "react";
import type { Metadata } from "next";
import { Catalog } from "@/components/ordering/catalog";
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
      <Catalog />
    </Suspense>
  );
}
