"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { MapPin, Store } from "lucide-react";
import { categories, productById } from "@/lib/products";
import { captureAttribution, track, trackOnce } from "@/lib/analytics";
import { ProductArt } from "@/components/ui/product-art";
const MerchantForm = dynamic(() => import("./merchant-form"));
export function LandingView() {
  useEffect(() => {
    captureAttribution();
    trackOnce("landing_view");
  }, []);
  return null;
}
export function CategoryCards() {
  const router = useRouter();
  return (
    <div className="category-grid">
      {categories.map((category) => (
        <button
          className="category-card"
          key={category.id}
          style={{ "--card-color": category.color } as React.CSSProperties}
          onClick={() => {
            track("category_clicked", {
              category: category.id,
              source: "landing",
            });
            router.push(`/pedir?categoria=${category.id}`);
          }}
        >
          <div className="category-art">
            <ProductArt product={productById.get(category.product)!} />
          </div>
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
}
export function CityPicker() {
  const router = useRouter();
  const [city, setCity] = useState("Faro");
  return (
    <div className="city-picker">
      <div className="city-options">
        {["Faro", "Lisboa", "Porto", "Coimbra", "Braga", "Outra"].map(
          (name) => (
            <button
              key={name}
              className={city === name ? "selected" : ""}
              aria-pressed={city === name}
              onClick={() => {
                setCity(name);
                router.push(
                  `/checkout?cidade=${encodeURIComponent(name === "Outra" ? "Outra zona" : name)}&interesse=1`,
                );
              }}
            >
              <MapPin size={16} />
              {name}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
export function MerchantSection() {
  const params = useSearchParams();
  const router = useRouter();
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const open = manuallyOpen || params.get("loja") === "1";
  const setOpen = (value: boolean) => {
    setManuallyOpen(value);
    if (!value && params.get("loja") === "1")
      router.replace("/#lojas", { scroll: false });
  };
  return (
    <section className="merchant-section" id="lojas">
      <div className="merchant-icon">
        <Store size={32} strokeWidth={1.5} />
      </div>
      <div>
        <h2>Tens uma loja?</h2>
        <p>Procuramos as primeiras lojas parceiras em Faro. Junta-te à Jola.</p>
      </div>
      <button className="button button-secondary" onClick={() => setOpen(true)}>
        Quero vender na Jola
      </button>
      {open && <MerchantForm open={open} onOpenChange={setOpen} />}
    </section>
  );
}
