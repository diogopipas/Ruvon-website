"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowUpRight, MapPin, Plus, Store, Users } from "lucide-react";
import { categories, packs, productById } from "@/lib/products";
import { captureAttribution, track, trackOnce } from "@/lib/analytics";
import { money } from "@/lib/pricing";
import { ProductArt } from "@/components/ui/product-art";
import { Quantity } from "@/components/cart/quantity";
import { useCart } from "@/components/providers";
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
          <span>
            {category.name}
            <ArrowUpRight size={17} />
          </span>
        </button>
      ))}
    </div>
  );
}
export function PackCards() {
  const { add, items, ready, ageConfirmed } = useCart();
  return (
    <div className="pack-grid">
      {packs.map((pack, index) => {
        const quantity =
          items.find((item) => item.id === pack.id)?.quantity ?? 0;
        return (
          <article
            className={`pack-card ${quantity ? "is-selected" : ""}`}
            key={pack.id}
            style={{ "--pack-color": pack.color } as React.CSSProperties}
          >
            <div className="pack-visual">
              <span className="pack-people">
                <Users size={13} />
                {pack.people}
              </span>
              {index === 1 && <span className="pack-tag">A nossa escolha</span>}
              <div className="pack-objects">
                {pack.items.map((id, i) => (
                  <div key={id} style={{ "--i": i } as React.CSSProperties}>
                    <ProductArt product={productById.get(id)!} />
                  </div>
                ))}
              </div>
              <span className="pack-visual-name">{pack.name}</span>
            </div>
            <div className="pack-info">
              <div>
                <h3>{pack.name}</h3>
                <strong>{money(pack.price)}</strong>
              </div>
              <p>{pack.description}</p>
              <ul
                className="pack-contents"
                aria-label={`O que inclui ${pack.name}`}
              >
                {pack.contents.map((content) => (
                  <li key={content}>{content}</li>
                ))}
              </ul>
              {quantity ? (
                <div className="pack-in-basket">
                  <span>No carrinho</span>
                  <Quantity id={pack.id} name={pack.name} compact />
                </div>
              ) : (
                <button
                  className="button pack-add"
                  disabled={!ready || !ageConfirmed}
                  onClick={() => add(pack.id)}
                  aria-label={`Juntar ${pack.name} ao carrinho`}
                >
                  <span>Juntar à noite</span>
                  <Plus size={18} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function CityPicker() {
  const router = useRouter();
  const [city, setCity] = useState("Lisboa");
  return (
    <div className="city-picker">
      <div className="city-options">
        {["Lisboa", "Porto", "Faro", "Coimbra", "Braga", "Outra"].map(
          (name) => (
            <button
              key={name}
              className={city === name ? "selected" : ""}
              aria-pressed={city === name}
              onClick={() => {
                setCity(name);
                router.push(
                  `/checkout?cidade=${encodeURIComponent(name === "Outra" ? "" : name)}&interesse=1`,
                );
              }}
            >
              <MapPin size={16} />
              {name}
              <ArrowUpRight size={14} />
            </button>
          ),
        )}
      </div>
      <p>A tua cidade pode ser a próxima. Tu ajudas-nos a decidir.</p>
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
        <p>
          Estamos à procura das primeiras lojas parceiras. O próximo saco pode
          sair da tua porta.
        </p>
      </div>
      <button className="button button-secondary" onClick={() => setOpen(true)}>
        Quero vender na Jola
        <ArrowUpRight size={18} />
      </button>
      {open && <MerchantForm open={open} onOpenChange={setOpen} />}
    </section>
  );
}
