"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Check, MapPin, Plus, Store, Users } from "lucide-react";
import { categories, packs, productById } from "@/lib/products";
import { captureAttribution, track } from "@/lib/analytics";
import { money } from "@/lib/pricing";
import { contactSchema } from "@/lib/validation";
import { ProductArt } from "@/components/ui/product-art";
import { Modal } from "@/components/ui/modal";
import { useCart } from "@/components/providers";
export function LandingView() {
  useEffect(() => {
    captureAttribution();
    track("landing_view");
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
  const { add, items } = useCart();
  return (
    <div className="pack-grid">
      {packs.map((pack, index) => (
        <article
          className="pack-card"
          key={pack.id}
          style={{ "--pack-color": pack.color } as React.CSSProperties}
        >
          <div className="pack-visual">
            <span className="pack-people">
              <Users size={13} />
              {pack.people}
            </span>
            {index === 1 && (
              <span className="pack-tag">A favorita da casa</span>
            )}
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
            <p className="pack-contents">{pack.contents.join(" + ")}</p>
            <button className="button pack-add" onClick={() => add(pack.id)}>
              <span>
                {items.some((i) => i.id === pack.id)
                  ? "Juntar mais um"
                  : "Juntar à noite"}
              </span>
              <Plus size={18} />
            </button>
          </div>
        </article>
      ))}
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
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const contact = contactSchema.safeParse(data.contact);
    if (!contact.success) {
      setError(contact.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent: data.consent === "on" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSuccess(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível guardar. Tenta novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="merchant-section" id="lojas">
      <div className="merchant-icon">
        <Store size={32} strokeWidth={1.5} />
      </div>
      <div>
        <h2>Tens uma loja?</h2>
        <p>
          Transforma stock em entregas sem teres de criar a tua própria
          operação.
        </p>
      </div>
      <button className="button button-secondary" onClick={() => setOpen(true)}>
        Quero vender na Jola
        <ArrowUpRight size={18} />
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={
          success ? "Vamos falar." : "A próxima Jola pode sair da tua loja."
        }
        description={
          success
            ? "Recebemos o teu interesse. Entraremos em contacto quando prepararmos o lançamento na tua zona."
            : "Mercearias, garrafeiras e lojas de bairro: há lugar para ti."
        }
      >
        {success ? (
          <div className="form-success">
            <Check size={36} />
            <button
              className="button button-primary"
              onClick={() => setOpen(false)}
            >
              Combinado
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="form-stack">
            <label>
              Nome da loja
              <input
                name="store_name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
                placeholder="A tua loja"
              />
            </label>
            <label>
              Cidade
              <input
                name="city"
                required
                minLength={2}
                maxLength={80}
                autoComplete="address-level2"
                placeholder="Lisboa"
              />
            </label>
            <label>
              O teu nome
              <input
                name="contact_name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                placeholder="Como te chamas?"
              />
            </label>
            <label>
              Email ou telemóvel
              <input
                name="contact"
                required
                maxLength={180}
                placeholder="ola@loja.pt ou 912 345 678"
              />
            </label>
            <input
              className="honeypot"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <label className="checkbox-label">
              <input type="checkbox" name="consent" required />
              Quero que a Jola me contacte sobre a parceria e li a{" "}
              <a href="/privacidade" target="_blank" rel="noreferrer">
                Privacidade
              </a>
              .
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button button-primary">
              {busy ? "A guardar…" : "Vamos a isso"}
              <ArrowUpRight size={18} />
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}
