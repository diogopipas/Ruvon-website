"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  MapPin,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { categories, products } from "@/lib/products";
import { money, priceBasket } from "@/lib/pricing";
import { track, trackOnce } from "@/lib/analytics";
import { PackCards } from "@/components/landing/landing-actions";
import { Wordmark } from "@/components/ui/wordmark";
import { ProductArt } from "@/components/ui/product-art";
import { Quantity } from "@/components/cart/quantity";
import { DesktopCart } from "@/components/cart/cart";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
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
        <ProductArt product={product} />
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <span className="product-selection-note" aria-hidden="true">
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
  const requested = params.get("categoria") || "todos";
  const active =
    requested === "packs" || categories.some((c) => c.id === requested)
      ? requested
      : "todos";
  const [search, setSearch] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressError, setAddressError] = useState("");
  const controlsRef = useRef<HTMLDivElement>(null);
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
      (active === "todos" || p.category === active) &&
      normalizeSearch(`${p.name} ${p.size}`).includes(normalizeSearch(search)),
  );
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
    if (id === "todos") next.delete("categoria");
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
              <strong>
                {location
                  ? `${location.city}, ${location.postcode}`
                  : "Escolher cidade"}
              </strong>
            </span>
            <ArrowUpRight size={17} />
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
        <div className="catalog-main">
          <div className="catalog-intro">
            <div>
              <span className="small-label">
                O botão de emergência da tua noite.
              </span>
              <h1>O que é que falta?</h1>
              <p>Monta a tua noite. Ajuda-nos a escolher onde lançar.</p>
            </div>
            <span className="catalog-time">
              <MapPin size={16} />
              Acesso antecipado<span>Ainda sem entregas</span>
            </span>
          </div>
          <div className="catalog-banner">
            <div>
              <span>Poupa nas decisões.</span>
              <h2>A noite toda, num pack.</h2>
              <p>De um pré tranquilo a uma casa cheia.</p>
            </div>
            <button
              onClick={() => chooseCategory("packs")}
              className="banner-pack"
            >
              <ShoppingBag size={34} />
              <span>
                Ver os packs<strong>4 noites à escolha ↗</strong>
              </span>
            </button>
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
            <nav className="category-chips" aria-label="Categorias de produtos">
              <button
                className={active === "todos" ? "active" : ""}
                aria-pressed={active === "todos"}
                onClick={() => chooseCategory("todos")}
              >
                Tudo para a noite
              </button>
              <button
                className={active === "packs" ? "active" : ""}
                aria-pressed={active === "packs"}
                onClick={() => chooseCategory("packs")}
              >
                <ShoppingBag size={16} /> Packs
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={active === c.id ? "active" : ""}
                  aria-pressed={active === c.id}
                  onClick={() => chooseCategory(c.id)}
                >
                  <span aria-hidden="true">{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="catalog-heading" ref={resultsRef}>
            <h2>
              {search
                ? `Resultados para “${search}”`
                : active === "packs"
                  ? "A noite resolvida"
                  : active === "todos"
                    ? "Os essenciais"
                    : categories.find((c) => c.id === active)?.name}
            </h2>
            <span role="status" aria-live="polite">
              {active === "packs" ? "4 packs" : `${filtered.length} produtos`}
            </span>
          </div>
          <p className="catalog-preview">
            {active === "packs"
              ? "Escolhe pelo grupo e pelo que te apetece. "
              : ""}
            Preços de antevisão. Não há pagamentos nem entregas nesta fase.
          </p>
          {active === "packs" ? (
            <div className="catalog-packs">
              <PackCards />
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
          <p className="catalog-end">
            O essencial está aqui. A melhor parte da noite está aí.
          </p>
        </div>
        <DesktopCart />
      </main>
      <Modal
        open={addressOpen}
        onOpenChange={setAddressOpen}
        title="Onde é a festa?"
        description="Só precisamos da cidade e do código postal para saber onde faz sentido chegar primeiro."
      >
        <form className="form-stack" onSubmit={saveAddress}>
          <label>
            Cidade
            <input
              required
              name="city"
              defaultValue={location?.city}
              minLength={2}
              maxLength={80}
              placeholder="Lisboa"
              autoComplete="address-level2"
            />
          </label>
          <label>
            Código postal
            <input
              required
              name="postcode"
              defaultValue={location?.postcode}
              pattern="[0-9]{4}-?[0-9]{3}"
              inputMode="numeric"
              maxLength={8}
              placeholder="1000-001"
              autoComplete="postal-code"
              aria-describedby="postcode-hint"
            />
            <small id="postcode-hint">
              7 algarismos, por exemplo 1000-001.
            </small>
          </label>
          {addressError && (
            <p role="alert" className="form-error">
              {addressError}
            </p>
          )}
          <button className="button button-primary">
            Guardar zona
            <ArrowRightIcon />
          </button>
        </form>
      </Modal>
    </>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={18} />;
}
