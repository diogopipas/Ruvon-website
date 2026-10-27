"use client";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/providers";
import { ProductArt } from "@/components/ui/product-art";
import { Quantity } from "@/components/cart/quantity";
import { money } from "@/lib/pricing";
import { trackOnce } from "@/lib/analytics";
import { packEvent } from "@/lib/packs";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const ref = useRef<HTMLElement>(null);
  const { items, ageConfirmed } = useCart();
  const quantity = items.find((item) => item.id === product.id)?.quantity ?? 0;
  useEffect(() => {
    if (!ageConfirmed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackOnce(
            "product_viewed",
            {
              ...packEvent(product.id),
              product: product.id,
              category: product.category,
            },
            `product_viewed:${product.id}`,
          );
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [product, ageConfirmed]);
  return (
    <article
      className={`product-card ${quantity ? "is-selected" : ""}`}
      ref={ref}
    >
      <div className="product-picture">
        <ProductArt product={product} showBundle />
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <div className="product-bottom">
          <strong>{money(product.price)}</strong>
          <Quantity id={product.id} name={product.name} />
        </div>
      </div>
    </article>
  );
}
