"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, Search, ShoppingBag, X } from "lucide-react";
import { categories, products } from "@/lib/products";
import { money, priceBasket } from "@/lib/pricing";
import { track, trackOnce } from "@/lib/analytics";
import { packEvent } from "@/lib/packs";
import { PackBrowser } from "@/components/packs/pack-browser";
import { Wordmark } from "@/components/ui/wordmark";
import { ProductArt } from "@/components/ui/product-art";
import { Quantity } from "@/components/cart/quantity";
import { DesktopCart } from "@/components/cart/cart";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { CitySelect } from "@/components/ui/city-select";
import { locationSchema } from "@/lib/validation";
import type { Product } from "@/types";
function ProductCard({ product }: { product: Product }) {
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
      {product.tag && <span className="product-tag">{product.tag}</span>}
      <div className="product-picture">
        <ProductArt product={product} showBundle />
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <span className="product-selection-note" aria-hidden={!quantity}>
          {quantity ? (
            <>
              <Check size={13} /> {quantity} no carrinho
            </>
          ) : (
            "\u00a0"
          )}
        </span>
        <div className="product-bottom">
          <strong>{money(product.price)}</strong>
          <Quantity id={product.id} name={product.name} />
        </div>
      </div>
    </article>
  );
}
export function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("categoria") || "packs";
  const active =
    requested === "packs" ||
    requested === "todos" ||
    requested === "gelo-mixers" ||
    categories.some((c) => c.id === requested)
      ? requested
      : "packs";
  const [search, setSearch] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressError, setAddressError] = useState("");
  const controlsRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const categoryChanged = useRef(false);
  const { location, setLocation, openCart, items } = useCart();
  const priced = priceBasket(items);
  const normalizeSearch = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt")
      .trim();
  const filtered = products.filter(
    (p) =>
      (active === "todos" ||
        p.category === active ||
        (active === "gelo-mixers" &&
          ["gelo", "mixers"].includes(p.category))) &&
      normalizeSearch(`${p.name} ${p.size}`).includes(normalizeSearch(search)),
  );
  useEffect(() => {
    const row = categoriesRef.current;
    const selected = row?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!row || !selected) return;
    const reveal = () =>
      row.scrollTo({
        left:
          row.scrollLeft +
          selected.getBoundingClientRect().left -
          row.getBoundingClientRect().left -
          8,
        behavior: "instant",
      });
    reveal();
    const resize = new ResizeObserver(reveal);
    resize.observe(row);
    return () => resize.disconnect();
  }, [active]);
  useEffect(() => {
    if (!categoryChanged.current || !resultsRef.current) return;
    categoryChanged.current = false;
    const header =
      document.querySelector(".shop-header")?.getBoundingClientRect().height ??
      83;
    const controls = controlsRef.current?.getBoundingClientRect().height ?? 140;
    window.scrollTo({
      top:
        window.scrollY +
        resultsRef.current.getBoundingClientRect().top -
        header -
        controls -
        16,
      behavior: "instant",
    });
  }, [active]);
  function chooseCategory(id: string) {
    if (id === active) return;
    categoryChanged.current = true;
    track("category_clicked", { category: id, source: "catalog" });
    setSearch("");
    const next = new URLSearchParams(params.toString());
    if (id === "packs") next.delete("categoria");
    else next.set("categoria", id);
    router.replace(`/pedir${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }
  function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = locationSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setAddressError(parsed.error.issues[0].message);
      return;
    }
    setLocation(parsed.data);
    track("location_entered", parsed.data);
    setAddressOpen(false);
  }
  return (
    <>
      <header className="shop-header">
        <div className="container shop-nav">
          <div className="shop-brand">
            <Link
              className="icon-button"
              href="/"
              aria-label="Voltar ao início"
            >
              <ArrowLeft size={20} />
            </Link>
            <Wordmark />
          </div>
          <button
            className="address-button"
            onClick={() => {
              setAddressError("");
              setAddressOpen(true);
            }}
          >
            <MapPin size={20} />
            <span>
              <small>A tua zona</small>
              <strong>{location?.city || "Escolher cidade"}</strong>
            </span>
          </button>
          <button
            className="shop-cart-button"
            onClick={openCart}
            aria-label={`Ver carrinho, ${priced.item_count} artigos`}
          >
            <ShoppingBag size={21} />
            <span>{priced.item_count}</span>
          </button>
        </div>
      </header>
      <main id="main" className="container shop-layout">
        <div
          className={`catalog-main ${active === "packs" ? "is-pack-view" : ""}`}
        >
          <div className="catalog-intro">
            <div>
              <h1>
                {active === "packs"
                  ? "A noite, resolvida."
                  : "O que é que falta?"}
              </h1>
            </div>
            <span className="catalog-time">
              <MapPin size={16} />
              Acesso antecipado
            </span>
          </div>
          <div className="catalog-controls" ref={controlsRef}>
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Procurar produtos"
                value={search}
                onChange={(event) => {
                  if (active === "packs") chooseCategory("todos");
                  setSearch(event.target.value);
                }}
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Procuras alguma coisa?"
              />
              {search && (
                <button
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearch("")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <nav
              className="category-chips"
              aria-label="Categorias de produtos"
              ref={categoriesRef}
            >
              <button
                className={active === "packs" ? "active" : ""}
                aria-pressed={active === "packs"}
                onClick={() => chooseCategory("packs")}
              >
                Packs
              </button>
              <button
                className={active === "todos" ? "active" : ""}
                aria-pressed={active === "todos"}
                onClick={() => chooseCategory("todos")}
              >
                Avulso
              </button>
              {[
                "cerveja",
                "cidra",
                "spirits",
                "vinho",
                "gelo-mixers",
                "snacks",
                "festa",
              ]
                .map((id) =>
                  id === "gelo-mixers"
                    ? { id, name: "Gelo & Mixers" }
                    : categories.find((c) => c.id === id)!,
                )
                .map((c) => (
                  <button
                    key={c.id}
                    className={active === c.id ? "active" : ""}
                    aria-pressed={active === c.id}
                    onClick={() => chooseCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
            </nav>
          </div>
          <div
            className="catalog-heading"
            ref={active === "packs" ? undefined : resultsRef}
          >
            <h2>
              {search
                ? `Resultados para “${search}”`
                : active === "packs"
                  ? "A noite resolvida"
                  : active === "todos"
                    ? "Os essenciais"
                    : active === "gelo-mixers"
                      ? "Gelo & Mixers"
                      : categories.find((c) => c.id === active)?.name}
            </h2>
            <span role="status" aria-live="polite">
              {active === "packs" ? "6 packs" : `${filtered.length} produtos`}
            </span>
          </div>
          {active === "packs" ? (
            <div className="catalog-packs" ref={resultsRef}>
              <PackBrowser />
            </div>
          ) : (
            <div className="product-grid">
              {filtered.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
          {active !== "packs" && !filtered.length && (
            <div className="search-empty">
              <Search size={32} />
              <h3>Ainda não temos isso no saco.</h3>
              <p>Experimenta outro nome ou espreita as outras categorias.</p>
              <button
                className="button button-secondary"
                onClick={() => {
                  setSearch("");
                  chooseCategory("todos");
                }}
              >
                Ver todos os produtos
              </button>
            </div>
          )}
        </div>
        <DesktopCart />
      </main>
      <Modal
        open={addressOpen}
        onOpenChange={setAddressOpen}
        title="Onde é a festa?"
        description="Seleciona a tua cidade para registarmos o teu interesse e escolhermos as primeiras zonas."
      >
        <form className="form-stack" onSubmit={saveAddress}>
          <label>
            Cidade
            <CitySelect defaultValue={location?.city || ""} />
          </label>
          {addressError && (
            <p role="alert" className="form-error">
              {addressError}
            </p>
          )}
          <button className="button button-primary">Guardar zona</button>
        </form>
      </Modal>
    </>
  );
}
